import { bad, providerConfig, getCookie, hmacHex, timingSafeEqual, cookie, verifyIdToken, findOrCreateIdentity, createSession, normalizeEmail, rateLimit, clientKey } from '../../lib.js';

// Federated sign-in, step 2: validate state, exchange the code, verify the identity, start a session.
export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return bad('accounts are not enabled on this deployment', 503);
  const cfg = providerConfig(env, String(params.provider || '').toLowerCase());
  if (!cfg) return bad('that sign-in provider is not configured on this site', 404);
  if (!(await rateLimit(env.DB, `oauthcb:${await clientKey(request)}`, 20, 900))) return bad('too many sign-in attempts', 429);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const raw = getCookie(request, 'xqlt_oauth') || '';
  const clear = cookie('xqlt_oauth', '', { maxAge: 0, path: '/api/auth' });
  const fail = (msg) => new Response(null, { status: 302, headers: { location: `/#account?error=${encodeURIComponent(msg)}`, 'set-cookie': clear, 'cache-control': 'no-store' } });
  if (url.searchParams.get('error')) return fail('sign-in was cancelled or refused by the provider');
  if (!code || !state) return fail('missing sign-in parameters');
  const parts = raw.split('.');
  if (parts.length !== 6) return fail('sign-in session expired, please try again');
  const [name, cState, nonce, verifier, issued, sig] = parts;
  const payload = `${name}.${cState}.${nonce}.${verifier}.${issued}`;
  if (!timingSafeEqual(sig, await hmacHex(env.SESSION_SECRET || '', payload))) return fail('sign-in session invalid');
  if (name !== cfg.name || !timingSafeEqual(cState, state) || Date.now() - Number(issued) > 600000) return fail('sign-in session expired, please try again');

  let identity;
  try {
    if (cfg.kind === 'github') identity = await githubIdentity(cfg, code);
    else identity = await oidcIdentity(cfg, code, verifier, nonce);
  } catch (e) { console.error('oauth callback failed', cfg.name, e && e.message); return fail(`sign-in failed: ${e.message}`); }

  const { user, created } = await findOrCreateIdentity(env.DB, cfg.name, identity.subject, identity.email, identity.name, identity.handle);
  const session = await createSession(env.DB, user.id);
  const headers = new Headers({ location: created ? '/#account?welcome=1' : '/#account', 'cache-control': 'no-store' });
  headers.append('set-cookie', session.setCookie);
  headers.append('set-cookie', clear);
  return new Response(null, { status: 302, headers });
}

async function githubIdentity(cfg, code) {
  const tokenRes = await fetch(cfg.tokenUrl, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'xql-tutor' }, body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: cfg.redirect }) });
  const token = await tokenRes.json();
  if (!token.access_token) throw new Error(`no access token from GitHub (${token.error || tokenRes.status}${token.error_description ? ': ' + token.error_description : ''})`);
  const gh = { authorization: `Bearer ${token.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'xql-tutor' };
  const user = await (await fetch('https://api.github.com/user', { headers: gh })).json();
  if (!user.id) throw new Error('GitHub did not return a user');
  let email = null;
  try {
    const emails = await (await fetch('https://api.github.com/user/emails', { headers: gh })).json();
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) : null;
    email = primary ? normalizeEmail(primary.email) : null;
  } catch (e) { /* email is optional for GitHub accounts */ }
  return { subject: String(user.id), email, name: user.name || user.login, handle: user.login };
}

async function oidcIdentity(cfg, code, verifier, nonce) {
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirect, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: verifier });
  const tokenRes = await fetch(cfg.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form });
  const token = await tokenRes.json();
  if (!token.id_token) throw new Error(`no id_token from the provider (${token.error || tokenRes.status}${token.error_description ? ': ' + String(token.error_description).slice(0, 120) : ''})`);
  const claims = await verifyIdToken(cfg, token.id_token, nonce);
  const email = claims.email && (claims.email_verified !== false) ? normalizeEmail(claims.email) : (claims.preferred_username && claims.preferred_username.includes('@') ? normalizeEmail(claims.preferred_username) : null);
  const subject = cfg.name === 'microsoft' ? `${claims.tid}:${claims.oid || claims.sub}` : claims.sub;
  if (!subject) throw new Error('provider did not return a subject');
  return { subject, email, name: claims.given_name || claims.name || null, handle: null };
}
