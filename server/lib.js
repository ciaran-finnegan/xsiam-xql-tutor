// Shared code for the Cloudflare Pages Functions (ESM). Loads the same engine and exercise bank as the browser so
// answers can be re-graded on the server, and provides the small security helpers the API routes need.
import '../js/engine/lexer.js';
import '../js/engine/parser.js';
import '../js/engine/functions.js';
import '../js/data/datasets.js';
import '../js/engine/evaluator.js';
import '../js/data/datasets-tenant.js';
import '../js/content/concepts.js';
import '../js/content/exercises-1.js';
import '../js/content/exercises-2.js';
import '../js/content/exercises-3.js';
import '../js/content/exercises-4.js';
import '../js/content/exercises-5.js';

export const XQL = globalThis.XQL;
const EX_BY_ID = new Map((XQL.EXERCISES || []).map((e) => [e.id, e]));
export const exerciseById = (id) => EX_BY_ID.get(id) || null;

// ---- responses ---------------------------------------------------------------------------------
export const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
});
export const bad = (message, status = 400) => json({ error: message }, status);

export async function readJson(request, maxBytes = 65536) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error('payload too large');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('payload too large');
  try { return JSON.parse(text || '{}'); } catch (e) { throw new Error('invalid JSON'); }
}

// State-changing requests must come from the site itself (defence in depth next to SameSite cookies).
export function sameOrigin(request, env) {
  const origin = request.headers.get('origin');
  const self = new URL(request.url).origin;
  const allowed = new Set([self, env.APP_ORIGIN].filter(Boolean));
  if (origin && !allowed.has(origin)) return false;
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) return false;
  return true;
}

// ---- crypto -------------------------------------------------------------------------------------
const enc = new TextEncoder();
export const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(s) { return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
export async function hmacHex(secret, s) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(s)));
}
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}
export const randomHex = (bytes = 32) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
export function randomCode() { const a = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000; return String(a).padStart(6, '0'); }
export const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64urlDecode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

// ---- cookies ------------------------------------------------------------------------------------
export function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return null;
}
export function cookie(name, value, { maxAge = 0, path = '/', httpOnly = true, sameSite = 'Lax' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}; Secure`;
  if (httpOnly) c += '; HttpOnly';
  if (maxAge >= 0) c += `; Max-Age=${maxAge}`;
  return c;
}
export const SESSION_COOKIE = 'xqlt_session';
export const SESSION_DAYS = 30;

// ---- rate limiting (fixed windows in D1) ---------------------------------------------------------------
export async function rateLimit(db, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').bind(key).first();
  if (!row || now - row.window_start >= windowSec) {
    await db.prepare('INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
    return true;
  }
  if (row.count >= limit) return false;
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}
export async function clientKey(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  return (await sha256Hex('ip:' + ip)).slice(0, 32);
}

// ---- users, identities, sessions ------------------------------------------------------------------------
export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
export const HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$/;
const HANDLE_DENY = ['admin', 'administrator', 'root', 'support', 'moderator', 'staff', 'system', 'paloalto', 'cortex', 'xql-tutor', 'riskscope'];
export const validHandle = (h) => HANDLE_RE.test(h) && !HANDLE_DENY.includes(h.toLowerCase());

export function firstName(name) {
  const n = String(name || '').trim().split(/\s+/)[0] || '';
  return n.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
}
async function uniqueHandle(db, base) {
  let root = (base || '').replace(/[^A-Za-z0-9_-]/g, '').replace(/^[_-]+/, '').slice(0, 12);
  if (root.length < 3) root = 'learner';
  for (let i = 0; i < 8; i++) {
    const candidate = `${root}-${randomHex(2)}`;
    const hit = await db.prepare('SELECT 1 FROM users WHERE handle = ?').bind(candidate).first();
    if (!hit && validHandle(candidate)) return candidate;
  }
  return `learner-${randomHex(4)}`;
}
export async function findOrCreateUserByEmail(db, email, displayName) {
  let user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (user) return { user, created: false };
  const id = randomHex(16);
  const handle = await uniqueHandle(db, firstName(displayName) || email.split('@')[0]);
  const now = Date.now();
  await db.prepare('INSERT INTO users (id, email, handle, display_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)').bind(id, email, handle, firstName(displayName) || null, now, now).run();
  user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return { user, created: true };
}
export async function findOrCreateIdentity(db, provider, subject, email, displayName, preferredHandle) {
  const ident = await db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').bind(provider, String(subject)).first();
  if (ident) {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(ident.user_id).first();
    if (user) return { user, created: false };
  }
  let user = email ? await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() : null;
  let created = false;
  if (!user) {
    const id = randomHex(16);
    const handle = await uniqueHandle(db, preferredHandle || firstName(displayName) || (email ? email.split('@')[0] : 'learner'));
    const now = Date.now();
    await db.prepare('INSERT INTO users (id, email, handle, display_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)').bind(id, email || null, handle, firstName(displayName) || null, now, now).run();
    user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    created = true;
  }
  await db.prepare('INSERT OR IGNORE INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').bind(provider, String(subject), user.id, Date.now()).run();
  return { user, created };
}

export async function createSession(db, userId) {
  const id = randomHex(32);
  const now = Date.now();
  await db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(id), userId, now, now + SESSION_DAYS * 86400000).run();
  return { id, setCookie: cookie(SESSION_COOKIE, id, { maxAge: SESSION_DAYS * 86400 }) };
}
export async function getSessionUser(request, db) {
  const id = getCookie(request, SESSION_COOKIE);
  if (!id || !/^[0-9a-f]{64}$/.test(id)) return null;
  const row = await db.prepare('SELECT s.user_id, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.revoked = 0').bind(await sha256Hex(id)).first();
  if (!row || row.expires_at < Date.now()) return null;
  if (Date.now() - row.last_seen > 3600000) await db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(Date.now(), row.id).run();
  return row;
}
export async function revokeSession(request, db) {
  const id = getCookie(request, SESSION_COOKIE);
  if (id && /^[0-9a-f]{64}$/.test(id)) await db.prepare('UPDATE sessions SET revoked = 1 WHERE id_hash = ?').bind(await sha256Hex(id)).run();
  return cookie(SESSION_COOKIE, '', { maxAge: 0 });
}
export const publicUser = (u) => (u ? { handle: u.handle, displayName: u.display_name || null, createdAt: u.created_at } : null);

// ---- grading and points -------------------------------------------------------------------------------
const WEIGHT = { concept: 1, mcq: 1, predict: 1, bug: 1, parsons: 2, cloze: 2, write: 3 };
export const pointsFor = (ex) => (WEIGHT[ex.type] || 1) * Math.max(1, Math.min(5, Number(ex.difficulty) || 1));

export function gradeAnswer(ex, answer) {
  if (!ex) return { correct: false, reason: 'unknown card' };
  if (['concept', 'mcq', 'predict'].includes(ex.type)) return { correct: Number(answer) === ex.answer };
  if (ex.type === 'bug') return { correct: Number(answer) === ex.bugLine };
  if (['parsons', 'cloze', 'write'].includes(ex.type)) {
    if (typeof answer !== 'string' || answer.length > 4000) return { correct: false, reason: 'query missing' };
    try {
      const expected = XQL.run(ex.solution);
      const actual = XQL.run(answer);
      const cmp = XQL.compareResults(expected, actual, { ordered: XQL.isOrdered(expected.ast) });
      return { correct: !!cmp.ok, reason: cmp.ok ? null : cmp.reason };
    } catch (e) { return { correct: false, reason: e.message }; }
  }
  return { correct: false, reason: 'unsupported card type' };
}

export async function awardPoints(db, userId, ex) {
  const now = Date.now();
  const pts = pointsFor(ex);
  const res = await db.prepare('INSERT OR IGNORE INTO card_results (user_id, card_id, points, solved_at) VALUES (?, ?, ?, ?)').bind(userId, ex.id, pts, now).run();
  const awarded = res.meta && res.meta.changes > 0;
  if (awarded) {
    await db.prepare('INSERT INTO scores (user_id, points, cards, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO UPDATE SET points = points + excluded.points, cards = cards + 1, updated_at = excluded.updated_at').bind(userId, pts, now).run();
  }
  const score = await db.prepare('SELECT points, cards FROM scores WHERE user_id = ?').bind(userId).first();
  return { awarded, points: awarded ? pts : 0, total: score ? score.points : 0, cards: score ? score.cards : 0 };
}

// ---- email --------------------------------------------------------------------------------------------
export function emailConfigured(env) { return !!(env.EMAIL && env.EMAIL_FROM); }
export async function sendOtpEmail(env, to, code) {
  const site = env.APP_ORIGIN || 'XQL Tutor';
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: 'XQL Tutor' },
    to,
    subject: `${code} is your XQL Tutor sign-in code`,
    text: `Your XQL Tutor sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.\n\n${site}`,
    html: `<p>Your XQL Tutor sign-in code is <strong style="font-size:1.4em;letter-spacing:2px">${code}</strong>.</p><p>It expires in 10 minutes. If you did not request it, ignore this email.</p><p style="color:#666">${site}</p>`,
  });
}

// ---- federated providers --------------------------------------------------------------------------------------
export function providerConfig(env, name) {
  const base = (env.APP_ORIGIN || '').replace(/\/$/, '');
  const redirect = `${base}/api/auth/${name}/callback`;
  switch (name) {
    case 'github':
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
      return { name, kind: 'github', clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, redirect, authUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token', scope: 'read:user user:email' };
    case 'google':
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
      return { name, kind: 'oidc', clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirect, authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'], scope: 'openid email profile' };
    case 'microsoft':
      if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) return null;
      return { name, kind: 'oidc', clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, redirect, authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', jwksUrl: 'https://login.microsoftonline.com/common/discovery/v2.0/keys', issuerPrefix: 'https://login.microsoftonline.com/', scope: 'openid email profile' };
    default: return null;
  }
}
export const availableProviders = (env) => ['github', 'google', 'microsoft'].filter((p) => providerConfig(env, p));

// Verify an RS256 id_token against the provider's JWKS and return its claims.
export async function verifyIdToken(cfg, idToken, nonce) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('malformed id_token');
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  if (header.alg !== 'RS256') throw new Error('unexpected id_token algorithm');
  const jwks = await (await fetch(cfg.jwksUrl, { cf: { cacheTtl: 3600 } })).json();
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('id_token signature invalid');
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now - 60) throw new Error('id_token expired');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(cfg.clientId)) throw new Error('id_token audience mismatch');
  if (cfg.issuers && !cfg.issuers.includes(claims.iss)) throw new Error('id_token issuer mismatch');
  if (cfg.issuerPrefix && !(String(claims.iss).startsWith(cfg.issuerPrefix) && String(claims.iss).endsWith('/v2.0'))) throw new Error('id_token issuer mismatch');
  if (nonce && claims.nonce !== nonce) throw new Error('id_token nonce mismatch');
  return claims;
}
