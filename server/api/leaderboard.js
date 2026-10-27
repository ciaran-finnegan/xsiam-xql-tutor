import { json, getSessionUser } from '../lib.js';

// Handles only. No email addresses, no full names, no identifiers that could be joined to anything else.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ rows: [], me: null, enabled: false });
  const period = new URL(request.url).searchParams.get('period') === '30d' ? 30 : null;
  const since = period ? Date.now() - period * 86400000 : 0;
  const rows = period
    ? (await env.DB.prepare('SELECT u.handle AS handle, SUM(c.points) AS points, COUNT(*) AS cards, MAX(c.solved_at) AS last_active FROM card_results c JOIN users u ON u.id = c.user_id WHERE c.solved_at >= ? GROUP BY c.user_id ORDER BY points DESC, last_active ASC LIMIT 50').bind(since).all()).results
    : (await env.DB.prepare('SELECT u.handle AS handle, s.points AS points, s.cards AS cards, s.updated_at AS last_active FROM scores s JOIN users u ON u.id = s.user_id ORDER BY s.points DESC, s.updated_at ASC LIMIT 50').all()).results;
  const out = rows.map((r, i) => ({ rank: i + 1, handle: r.handle, points: r.points, cards: r.cards, lastActive: new Date(r.last_active).toISOString().slice(0, 10) }));
  const user = await getSessionUser(request, env.DB);
  let me = null;
  if (user) {
    const score = await env.DB.prepare('SELECT points, cards FROM scores WHERE user_id = ?').bind(user.id).first();
    if (score) { const r = await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE points > ?').bind(score.points).first(); me = { handle: user.handle, points: score.points, cards: score.cards, rank: r.rank }; }
    else me = { handle: user.handle, points: 0, cards: 0, rank: null };
  }
  return json({ rows: out, me, enabled: true, period: period ? '30d' : 'all' });
}
