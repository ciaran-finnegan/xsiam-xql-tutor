import { json, bad, readJson, sameOrigin, getSessionUser, exerciseById, gradeAnswer, awardPoints, rateLimit } from '../lib.js';

// The browser reports an answer it graded as correct; the server grades it again with the same engine before
// awarding points, once per card. Nothing the client sends is trusted as a score.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return bad('accounts are not enabled on this deployment', 503);
  if (!sameOrigin(request, env)) return bad('cross-site request refused', 403);
  const user = await getSessionUser(request, env.DB);
  if (!user) return bad('sign in to record points', 401);
  if (!(await rateLimit(env.DB, `answers:${user.id}`, 120, 60))) return bad('too many answers, slow down', 429);
  let body;
  try { body = await readJson(request, 16384); } catch (e) { return bad(e.message); }
  const ex = exerciseById(String(body.cardId || ''));
  if (!ex) return bad('unknown card', 404);
  const answer = ['parsons', 'cloze', 'write'].includes(ex.type) ? String(body.answer || '') : Number(body.answer);
  const graded = gradeAnswer(ex, answer);
  if (!graded.correct) return json({ correct: false, reason: graded.reason || null, awarded: false, points: 0 });
  const result = await awardPoints(env.DB, user.id, ex);
  return json({ correct: true, ...result });
}
