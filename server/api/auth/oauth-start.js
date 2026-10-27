import { bad, providerConfig, randomHex, b64url, hmacHex, cookie } from '../../lib.js';

// Federated sign-in, step 1: redirect to the provider with a signed state (and PKCE for OIDC providers).
export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return bad('accounts are not enabled on this deployment', 503);
  const cfg = providerConfig(env, String(params.provider || '').toLowerCase());
  if (!cfg) return bad('that sign-in provider is not configured on this site', 404);
  if (!env.SESSION_SECRET) return bad('server misconfigured', 500);
  const state = randomHex(16);
  const nonce = randomHex(16);
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const issued = Date.now();
  const payload = `${cfg.name}.${state}.${nonce}.${verifier}.${issued}`;
  const sig = await hmacHex(env.SESSION_SECRET, payload);
  const url = new URL(cfg.authUrl);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', state);
  if (cfg.kind === 'oidc') {
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (cfg.name === 'google') url.searchParams.set('prompt', 'select_account');
  }
  return new Response(null, { status: 302, headers: { location: url.toString(), 'set-cookie': cookie('xqlt_oauth', `${payload}.${sig}`, { maxAge: 600, path: '/api/auth' }), 'cache-control': 'no-store' } });
}
