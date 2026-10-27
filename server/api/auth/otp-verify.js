import { json, bad, readJson, sameOrigin, rateLimit, normalizeEmail, validEmail, sha256Hex, timingSafeEqual, findOrCreateUserByEmail, createSession, publicUser } from '../../lib.js';

// Email one-time code, step 2: verify the code, create the account on first use, start a session.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return bad('accounts are not enabled on this deployment', 503);
  if (!sameOrigin(request, env)) return bad('cross-site request refused', 403);
  let body;
  try { body = await readJson(request, 4096); } catch (e) { return bad(e.message); }
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').replace(/\s+/g, '');
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return bad('enter the 6-digit code from the email');
  if (!(await rateLimit(env.DB, `otpv:${await sha256Hex(email)}`, 10, 900))) return bad('too many attempts, request a new code later', 429);
  const row = await env.DB.prepare('SELECT id, code_hash, expires_at, attempts FROM otp_codes WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1').bind(email).first();
  if (!row || row.expires_at < Date.now()) return bad('that code has expired, request a new one', 400);
  if (row.attempts >= 5) { await env.DB.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').bind(row.id).run(); return bad('too many wrong attempts, request a new code', 400); }
  await env.DB.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
  const expected = await sha256Hex(`${env.OTP_PEPPER || ''}:${email}:${code}`);
  if (!timingSafeEqual(expected, row.code_hash)) return bad('that code is not right', 400);
  await env.DB.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').bind(row.id).run();
  const { user, created } = await findOrCreateUserByEmail(env.DB, email, null);
  const session = await createSession(env.DB, user.id);
  return json({ ok: true, user: publicUser(user), needsHandle: created }, 200, { 'set-cookie': session.setCookie });
}
