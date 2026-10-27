# Contributing

Thanks for helping people learn XQL. Contributions of new cards, corrections to existing cards, engine fixes and
documentation are all welcome.

## Ground rules

- Everything in this repository is fictional. Never add a real organisation's names, hostnames, account ids,
  addresses, users or query text. Internet addresses must come from the RFC 5737 documentation ranges
  (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24); AWS account ids from the AWS documentation examples.
- Dataset and field names must be the vendor-standard ones documented by Palo Alto Networks. If you are not sure a
  field exists, check the Cortex XSIAM documentation first (every page is also available as Markdown by appending `.md`).
- Explanations teach the rule and why, in one to three sentences, and link to the vendor page they come from.
- No tracking, analytics or third-party scripts.

## Adding or changing cards

1. Read `docs/CONTENT_GUIDE.md`. It defines the card schema, the grading rules and the sample tenant's storylines.
2. Add cards to `js/content/exercises-3.js` (or the unit's own file if you are editing an existing unit). Ids are
   `<unit>-<nn>`.
3. Compute every answer with the engine, never from memory:
   `node -e "const X=require('./test/load').loadEngine(); const r=X.run('<query>'); console.log(r.columns, r.rows)"`
4. Run `npm test`. The validator executes every reference query and rejects anything the engine cannot run or that
   contradicts the engine's result.
5. Open a pull request. Describe which rule the card teaches and which vendor page backs it.

## Changing the engine

The engine in `js/engine/` implements the documented XQL semantics. A change that makes the sandbox behave more like
the product (with a reference to the vendor page) is welcome; a change that makes it more convenient but less faithful
is not. Add a test to `test/engine.test.js` for every behaviour change.

## Development

```bash
npm start          # http://127.0.0.1:8765/
npm test           # engine tests + exercise validator + server-side grading and auth helper tests
npm run build      # produces dist/ for deployment
```

No dependencies are required. Node 20 or newer.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## Publishing checks

`node scripts/check-public.js` runs in CI and before every deploy. It refuses to publish if a file git would ship contains a
secret. Operators can add private deny patterns, one regular expression per line, in the gitignored file
`.check-public.local` or in the `CHECK_PUBLIC_PATTERNS` environment variable (CI reads it from a repository secret of the
same name).
