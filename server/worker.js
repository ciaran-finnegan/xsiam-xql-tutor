// Cloudflare Worker entry: serves the static site from ./dist and the small accounts API under /api/.
// Static requests never reach this code (run_worker_first is limited to /api/*).
import * as me from './api/me.js';
import * as leaderboard from './api/leaderboard.js';
import * as answers from './api/answers.js';
import * as profile from './api/profile.js';
import * as logout from './api/auth/logout.js';
import * as otpStart from './api/auth/otp-start.js';
import * as otpVerify from './api/auth/otp-verify.js';
import * as oauthStart from './api/auth/oauth-start.js';
import * as oauthCallback from './api/auth/oauth-callback.js';
import { json } from './lib.js';

const ROUTES = [
  ['GET', /^\/api\/me$/, me.onRequestGet],
  ['GET', /^\/api\/leaderboard$/, leaderboard.onRequestGet],
  ['POST', /^\/api\/answers$/, answers.onRequestPost],
  ['POST', /^\/api\/profile$/, profile.onRequestPost],
  ['DELETE', /^\/api\/profile$/, profile.onRequestDelete],
  ['POST', /^\/api\/auth\/logout$/, logout.onRequestPost],
  ['POST', /^\/api\/auth\/otp\/start$/, otpStart.onRequestPost],
  ['POST', /^\/api\/auth\/otp\/verify$/, otpVerify.onRequestPost],
  ['GET', /^\/api\/auth\/(github|google|microsoft)\/start$/, oauthStart.onRequestGet],
  ['GET', /^\/api\/auth\/(github|google|microsoft)\/callback$/, oauthCallback.onRequestGet],
];

const API_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    let res;
    try {
      let matched = null, methodMismatch = false;
      for (const [method, re, handler] of ROUTES) {
        const m = url.pathname.match(re);
        if (!m) continue;
        if (method !== request.method) { methodMismatch = true; continue; }
        matched = { handler, params: { provider: m[1] } };
        break;
      }
      if (matched) res = await matched.handler({ request, env, params: matched.params });
      else res = json({ error: methodMismatch ? 'method not allowed' : 'not found' }, methodMismatch ? 405 : 404);
    } catch (e) {
      console.error('api error', url.pathname, e && e.message);
      res = json({ error: 'something went wrong on the server' }, 500);
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(API_HEADERS)) if (!headers.has(k) || k !== 'Cache-Control') headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
