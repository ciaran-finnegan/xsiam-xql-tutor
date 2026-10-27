import { json, bad, sameOrigin, revokeSession } from '../../lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return bad('accounts are not enabled on this deployment', 503);
  if (!sameOrigin(request, env)) return bad('cross-site request refused', 403);
  const clear = await revokeSession(request, env.DB);
  return json({ ok: true }, 200, { 'set-cookie': clear });
}
