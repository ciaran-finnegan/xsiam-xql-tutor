import { json, bad, readJson, sameOrigin, getSessionUser, validHandle, publicUser } from '../lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return bad('accounts are not enabled on this deployment', 503);
  if (!sameOrigin(request, env)) return bad('cross-site request refused', 403);
  const user = await getSessionUser(request, env.DB);
  if (!user) return bad('not signed in', 401);
  let body;
  try { body = await readJson(request, 4096); } catch (e) { return bad(e.message); }
  const handle = String(body.handle || '').trim();
  if (!validHandle(handle)) return bad('Handles are 3-20 characters: letters, digits, _ or -, and cannot be a reserved word.');
  const taken = await env.DB.prepare('SELECT id FROM users WHERE handle = ? AND id != ?').bind(handle, user.id).first();
  if (taken) return bad('that handle is taken', 409);
  await env.DB.prepare('UPDATE users SET handle = ? WHERE id = ?').bind(handle, user.id).run();
  return json({ user: publicUser({ ...user, handle }) });
}

// Delete the account and everything stored about it.
export async function onRequestDelete({ request, env }) {
  if (!env.DB) return bad('accounts are not enabled on this deployment', 503);
  if (!sameOrigin(request, env)) return bad('cross-site request refused', 403);
  const user = await getSessionUser(request, env.DB);
  if (!user) return bad('not signed in', 401);
  const db = env.DB;
  await db.batch([
    db.prepare('DELETE FROM card_results WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM scores WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM identities WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json({ ok: true }, 200, { 'set-cookie': 'xqlt_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax' });
}
