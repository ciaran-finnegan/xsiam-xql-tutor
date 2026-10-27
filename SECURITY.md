# Security policy

XQL Tutor is a static learning app plus a small Cloudflare Worker API (`server/`) for optional sign-in and the
leaderboard. It handles no customer data: the datasets are fictional, learning progress lives in the visitor's
browser, and the optional account stores only an email address or provider id, a display handle and scores. One-time codes are
sent through Resend from a verified domain.

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Preferred: use GitHub's private vulnerability reporting on this repository ("Security" tab, "Report a vulnerability").
- Otherwise contact the maintainer through https://riskscope-consulting.com.

Include the steps to reproduce, the impact you expect, and a way to reach you. You will get an acknowledgement
within 5 working days and a fix or a decision within 30 days for anything confirmed. Credit is given in the
changelog unless you prefer otherwise.

## Scope

In scope: this repository, the published site, and the Worker API under `server/` (authentication, sessions,
leaderboard, server-side grading, rate limiting). Out of scope: Palo Alto Networks products and documentation, third-party identity
providers, and Cloudflare itself (report those to their owners).

## What is in place

- No third-party JavaScript or CSS except Cloudflare Web Analytics' cookieless beacon, which the CSP allows explicitly;
  everything else is served from the site's own origin.
- A strict Content Security Policy (`_headers`): scripts only from self and the analytics beacon host, no inline scripts, no framing, no object
  embeds, `connect-src` limited to the site's own API.
- HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
- Passwordless sign-in only: one-time email codes and federated identity providers (authorization code with signed state,
  PKCE, and `id_token` signature, audience, issuer and nonce checks); codes are hashed at rest,
  expire after 10 minutes, are single use, and both sends and verifications are rate limited per address and per client.
- Sessions are HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookies with a 30-day lifetime; sign-out revokes them.
- The leaderboard shows handles only (3-20 characters, letters, digits, `_` and `-`), never email addresses.
- Secrets live in Cloudflare (Worker secrets), never in the repository; `.env*` and `.dev.vars*` files are ignored by git.
- Points are awarded only after the server re-grades the answer; the client never sends a score. State-changing API calls
  require a same-origin request on top of `SameSite` cookies.
- Continuous integration runs the engine tests and the exercise validator on every push, and CodeQL scans the JavaScript.
- Dependencies: none at runtime. Dependabot keeps the GitHub Actions pinned versions current.

## Supported versions

Only the latest commit on `main` and the deployed site are supported.
