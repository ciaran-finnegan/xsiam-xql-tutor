# Deployment

The public site at <https://xql-tutor.riskscope-consulting.com> is a single Cloudflare Worker: the static app is served
from `dist/` as Worker static assets, and the small accounts API under `/api/` runs in `server/worker.js`. Nothing else is
needed to serve the tutor; without the API the app still works as a purely static site (every sign-in control hides itself).

```
dist/                 built by `node build.js` from index.html, css/, js/, _headers, robots.txt, LICENSE, NOTICE.md and two docs
server/worker.js      routes /api/* to the handlers in server/api/, everything else to the assets binding
server/lib.js         loads the same engine and exercise bank as the browser, grades answers, sessions, rate limits, crypto helpers
schema.sql            the D1 tables (users, identities, sessions, otp_codes, rate_limits, card_results, scores)
wrangler.jsonc        Worker name, account, custom domain, assets, D1 binding, public vars (origin, sender, client ids)
```

## Deploying your own copy

1. Install Node 20 or later and sign in to Cloudflare: `npx wrangler login`.
2. Create the database and put its id in `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create xql-tutor
   ```

3. Edit `wrangler.jsonc`: set `account_id`, replace the `routes` entry with your own hostname (the zone must be in the same
   account) or delete `routes` and set `"workers_dev": true` to use a `*.workers.dev` address, and set `APP_ORIGIN` to the
   final `https://` origin (it is used for OAuth redirects and the cross-site request check).
4. Create the tables and the two secrets (any 32-byte random values; keep them in a password manager):

   ```bash
   npm run db:migrate
   openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
   openssl rand -hex 32 | npx wrangler secret put OTP_PEPPER
   ```

5. Deploy. The script builds `dist/`, refuses to publish if a secret or a client identifier is found in tracked files, then
   uploads the Worker and its assets:

   ```bash
   npm run deploy
   ```

`npm run dev` serves the Worker locally with a local D1 (apply the schema with
`npx wrangler d1 execute xql-tutor --local --file=schema.sql` first; put local secrets in `.dev.vars`, which git ignores).
`npm start` serves only the static app, which is enough for content work.

## Turning on sign-in methods

Sign-in is passwordless and optional. Each method appears in the UI automatically once it is configured; with none
configured the "Sign in" button and the leaderboard stay hidden.

### Email one-time codes

Codes are sent through [Resend](https://resend.com) from `EMAIL_FROM`, an address on a domain verified in your Resend
account. Create an API key with sending-only permission restricted to that domain, then:

```bash
npx wrangler secret put RESEND_API_KEY
```

and set `EMAIL_FROM` in `wrangler.jsonc`. The Worker also still supports a Cloudflare Email Sending binding named `EMAIL`
(Workers Paid plan) if you prefer not to use Resend: add `"send_email": [{ "name": "EMAIL" }]` and leave `RESEND_API_KEY`
unset. Codes are six digits, hashed with `OTP_PEPPER` at rest, expire after 10 minutes, are single use, and are limited to
three sends per address and ten per client network every 15 minutes, with five wrong guesses per code.

### Federated sign-in (GitHub, Google, Microsoft)

Register an OAuth application with each provider you want, using these callback URLs on your origin. Give each one the
site's home page and `/privacy` as its privacy policy link; Google also needs the site's domain under authorized domains and the
app published to production on the Audience page before accounts outside the project's test users can sign in:

| Provider | Register at | Callback URL | Secrets |
| --- | --- | --- | --- |
| GitHub | Settings, Developer settings, OAuth Apps | `https://<origin>/api/auth/github/callback` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Google | Google Cloud console, APIs and Services, Credentials (OAuth client, Web application) | `https://<origin>/api/auth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Microsoft | Entra admin centre, App registrations (accounts in any organisational directory and personal accounts, Web platform) | `https://<origin>/api/auth/microsoft/callback` | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |

Store each value with `npx wrangler secret put <NAME>` (the client id may also go in `vars`). The Worker uses the
authorization-code flow with a signed, short-lived state cookie, PKCE for Google and Microsoft, and verifies the `id_token`
signature, audience, issuer, expiry and nonce against the provider's published keys before trusting the identity. It asks
for the smallest scopes that return a verified email address and a first name (`read:user user:email`, `openid email profile`).

## What is stored and where

The public summary for visitors is `privacy.html` (served at `/privacy`); keep it in step with this section.

- In the visitor's browser only: learning progress and the review schedule (`localStorage`). This never leaves the browser.
- In D1, only for people who sign in: email address (or the provider's subject id), the handle, a first name if a provider
  supplied one (never shown publicly), session hashes, and one row per card solved with its points. The leaderboard exposes
  handles, points, card counts and a last-active date, nothing else.
- Anyone can delete their account and every row about it from the Account page (`DELETE /api/profile`).
- Hashed per-client rate-limit counters and used one-time codes are housekeeping rows; expired codes are purged on the next
  send.

Points are awarded once per card after the server re-grades the submitted answer with the same engine the browser uses
(`write` cards score 3 x difficulty, `cloze` and `parsons` 2 x, reading cards 1 x). The client never sends a score.

## Operations

- `npx wrangler tail` streams request logs; Workers observability is enabled in `wrangler.jsonc`.
- `npx wrangler rollback` returns to the previous version; `npx wrangler versions list` shows the history.
- `npx wrangler d1 execute xql-tutor --remote --command "SELECT COUNT(*) FROM users"` for ad-hoc checks.
- Security headers for the static files come from `_headers` (strict CSP, HSTS, no framing); the API sets its own in
  `server/worker.js`. The CSP allows Cloudflare Web Analytics' beacon (`static.cloudflareinsights.com`, `cloudflareinsights.com`)
  so the zone's automatic analytics keep working; remove those two hosts from `_headers` if you do not use it.
