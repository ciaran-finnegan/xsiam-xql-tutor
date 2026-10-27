import { json, getSessionUser, publicUser, availableProviders, emailConfigured } from '../lib.js';

// Who am I, and which sign-in methods does this deployment offer. Safe to call anonymously.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ user: null, enabled: false, canSignIn: false, providers: { email: false, federated: [] } });
  const providers = { email: emailConfigured(env), federated: availableProviders(env) };
  const canSignIn = providers.email || providers.federated.length > 0;
  const user = await getSessionUser(request, env.DB);
  if (!user) return json({ user: null, providers, enabled: true, canSignIn });
  const score = await env.DB.prepare('SELECT points, cards FROM scores WHERE user_id = ?').bind(user.id).first();
  const rank = score ? await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE points > ?').bind(score.points).first() : null;
  return json({ user: { ...publicUser(user), points: score ? score.points : 0, cards: score ? score.cards : 0, rank: rank ? rank.rank : null }, providers, enabled: true, canSignIn });
}
