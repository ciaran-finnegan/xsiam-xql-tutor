import { json, bad, readJson, sameOrigin, rateLimit, clientKey, normalizeEmail, validEmail, randomCode, sha256Hex, emailConfigured, sendOtpEmail } from '../../lib.js';

// Email one-time code, step 1: send a 6-digit code. Codes are hashed with a server-side pepper, expire after
// 10 minutes and are single use. Sends are limited per address and per client.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return bad('accounts are not enabled on this deployment', 503);
  if (!sameOrigin(request, env)) return bad('cross-site request refused', 403);
  if (!emailConfigured(env)) return bad('email sign-in is not available yet on this site', 503);
  let body;
  try { body = await readJson(request, 4096); } catch (e) { return bad(e.message); }
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return bad('enter a valid email address');
  const ip = await clientKey(request);
  if (!(await rateLimit(env.DB, `otp:ip:${ip}`, 10, 900))) return bad('too many codes requested from this network, try again later', 429);
  if (!(await rateLimit(env.DB, `otp:email:${await sha256Hex(email)}`, 3, 900))) return bad('too many codes requested for this address, try again in 15 minutes', 429);
  const code = randomCode();
  const now = Date.now();
  await env.DB.prepare('DELETE FROM otp_codes WHERE expires_at < ?').bind(now - 86400000).run();
  await env.DB.prepare('UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0').bind(email).run();
  await env.DB.prepare('INSERT INTO otp_codes (email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(email, await sha256Hex(`${env.OTP_PEPPER || ''}:${email}:${code}`), now, now + 10 * 60000).run();
  try { await sendOtpEmail(env, email, code); } catch (e) { return bad('the code could not be sent, please try again later', 502); }
  return json({ ok: true });
}

