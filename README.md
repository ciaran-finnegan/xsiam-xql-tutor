# XQL Tutor

A small web app that teaches **Cortex XQL** (the query language of Palo Alto Networks Cortex XSIAM and Cortex XDR) by making you
read and write queries. No build step, no dependencies, no account needed: everything runs in the browser against a fictional
one-week tenant, and your written queries are graded by actually executing them.

Use it at <https://xql-tutor.riskscope-consulting.com>, or run it locally:

```bash
npm start
```

Then open <http://127.0.0.1:8765/>. (Any static file server works too, for example `python3 -m http.server 8765`.)
Run `npm test` to execute the engine tests and re-validate every exercise against the engine.

## What you get

| Tab | What it does |
|---|---|
| **Learn** | 17 units in a deliberate order. Units 1-12 teach the language (pipeline → filter → fields → text matching → the xdr_data model → sort/limit → comp → alter → time → dedup → join/union → hunting toolkit). Units 13-17 are the Acme Life log sources: perimeter and VPN (NGFW traffic, threat and URL logs, GlobalProtect, Prisma Access), AWS CloudTrail, cloud network flows (VPC and Azure NSG), Azure and Entra ID, and cross-source hunting (alerts, GitHub EMU, Snowflake, the Cortex Data Model). Each unit has ten cards that progress from reading to writing: 170 cards in all, every one validated against the engine. |
| **Review** | A spaced-repetition queue (SM-2 style). Cards you miss come back in ten minutes; cards you know come back in days. Sessions interleave units so you must pick the right tool. |
| **Sandbox** | A free editor over the sample datasets with a *stage-by-stage trace*: click any stage to see the rows after it. Ten hunting-style example queries are built in. |
| **Reference** | Cheat-sheet cards for 22 stages and 33 functions, each linking to the vendor page it was distilled from. |
| **Progress** | Mastery per unit and per exercise type, streak, export/import of progress, and the learning-science rationale. |

### Exercise types (per unit, in this order)

1. **Worked example** – an annotated query, stage by stage, that you can run and step through, followed by a check question.
2. **Quiz / Predict the output** – read a query and say what it returns (row counts, first row, aggregate values). After answering you run it and investigate the pipeline.
3. **Spot the bug** – click the broken stage, then see what the buggy query really does and the fix.
4. **Order the stages** – a Parsons problem: assemble shuffled stages into a working query (graded by executing it).
5. **Fill the blanks** – a faded worked example: type the missing operator, field or stage (graded by executing it).
6. **Write the query** – an analyst's question; write the whole query, with three progressive hints. Graded by comparing your result set with the model solution's, so any correct formulation passes.

### Why it is built this way

The design follows what the learning-science literature says works, and the app explains each technique in the Progress tab:

- **Retrieval practice** instead of re-reading (Roediger & Karpicke 2006; Dunlosky et al. 2013).
- **Spacing** with an SM-2 scheduler and **interleaving** across units (Cepeda et al. 2006; Rohrer 2012; Carpenter, Pan & Butler 2022).
- **Read before write with faded scaffolding**: worked examples → Parsons problems → completion → generation (Sweller's worked-example effect; Ericson et al. 2022 systematic review of Parsons problems; Hou et al. 2023 on Parsons problems as scaffolding for code writing).
- **Predict, Run, Investigate** (PRIMM, Sentance, Waite & Kallia 2019): every predict card ends with running the query and stepping through its stages.
- **Immediate, elaborated feedback** with the rule, the fix and the vendor reference link (Hattie & Timperley 2007).
- **Execution-based grading**: a query is right if it returns the right rows, not if it matches a string.

## The sandbox engine

`js/engine/` is a purpose-built interpreter for a large subset of XQL, written from the vendor command reference:

- Stages: `config` (case_sensitive, timeframe), `dataset` / `preset`, `datamodel` (the Cortex Data Model view of mapped datasets, with `xdm.*` fields, `XDM_CONST.*` values and `fieldset.xdm_network` / `xdm_auth`), `filter`, `fields`, `alter`, `comp`, `sort`, `limit`, `dedup`, `bin`, `join`, `union`, `replacenull`, `arrayexpand`, `top`, `windowcomp`, `iploc`, `tag`, `target`, `view`. `transaction`, `search`, `call`, `pivot` and `transpose` are parsed and explained but not executed.
- Operators: `= != < <= > >= in contains ~= !~= incidr`, `and or not`, wildcards with `*`, `null`, `ENUM.PROCESS`-style values, sub-queries inside `in (...)`, `//` and `/* */` comments, triple-quoted strings.
- ~60 functions (string, array, JSON, time, IP, math) and the comp aggregates (`count`, `count_distinct`, `sum`, `avg`, `min`, `max`, `median`, `values`, `list`, `earliest`, `latest`, `first`, `last`).
- Error messages are written to teach: unknown fields suggest the closest name, a field dropped by `comp` or renamed by `fields` says so, `sort _time desc` explains that the direction goes first, comparing a numeric field with `"443"` explains the type mismatch.

Product quirks that are modelled on purpose because they bite in real investigations: `join`, `union`, `dedup` and
`arrayexpand` lose sort order (the engine reorders and warns if a sort precedes them), `comp` cannot group by an array field
(use `to_string()` or `arrayexpand`), comparisons with null are null, and misspelled `ENUM.` / `XDM_CONST.` values are errors.
Known deviations from the product, all deliberate: the clock is frozen at 2026-10-27 08:00 UTC, `top` is exact rather than
approximate, regex matching with `~=` is unanchored (use `^` and `$`), the result grid shows only the columns you selected, and
the flow-log stories that the product stitches into `xdr_data` are exposed through `preset = network_story` so the endpoint
unit counts stay stable.

## The sample tenant

`js/data/datasets.js` holds 71 `xdr_data` rows for eight hosts (a phishing chain on a finance workstation, an Excel macro,
a PsExec lateral movement from the domain controller, a web shell, an analyst's legitimate nmap scan, a macOS credential
dialog, a CI server), 15 Windows event log rows (`microsoft_windows_raw`, with the EventData as a JSON string), the firewall
sessions (`panw_ngfw_traffic_raw`) and three lookups (`hva_hosts`, `ioc_hashes`, `user_directory`).

`js/data/datasets-tenant.js` adds the sources a production XSIAM tenant typically carries, with the vendor-standard dataset and
field names (as catalogued by the open-source `cortex-xsiam-mcp-gateway` project) and a fictional insurer, "Acme Life", with
invented identities, RFC 5737 internet addresses and the AWS documentation account ids:

| Dataset | What it models |
|---|---|
| `panw_ngfw_threat_raw`, `panw_ngfw_url_raw`, `panw_ngfw_globalprotect_raw` | NGFW threat signatures and WildFire verdicts, SNI-only URL logs, GlobalProtect portal/gateway events; `is_prisma_mobile` and `log_source_name` separate the on-prem firewall from Prisma Access |
| `amazon_aws_raw` | CloudTrail (`_log_type = "cloudtrail"`, JSON fields as strings) and VPC flow logs (`_log_type = "flowlogs"`) from two accounts named in the `acme-m<n>-<workload>-<env>-<nn>` pattern |
| `msft_azure_ad_raw`, `msft_azure_ad_audit_raw` | Entra ID sign-ins (status, location, deviceDetail, mfaDetail as JSON) and directory audit, including the Cloud Sync provisioning noise |
| `msft_azure_raw`, `msft_azure_flowlogs_raw` | Azure activity logs from Event Hub and NSG flow logs with the duplicate deliveries seen in the tenant |
| `github_github_audit_raw`, `snowflake_snowflake_raw` | GitHub EMU organisation audit (`<first>-<last>_AcmeLife` actors, UPN in `external_identity_username`) and Snowflake login history (upper-case fields) |
| `alerts` | Cortex alerts with array fields and the retroactive IOC alerts raised from stored flow logs |

The storylines are connected: the stolen AWS key, the Entra password spray, the consent-phishing app, the Azure NSG change,
the ALB scanner and the endpoint C2 all belong to the same week. `docs/CONTENT_GUIDE.md` describes them with checked numbers.
Office egress addresses (198.51.100.146/147) and the VPN egress (198.51.100.206) are modelled as the company's own addresses so that the
cards teach not to treat them as attackers.

## Documentation review

The syntax, semantics and gotchas encoded in the engine, the reference cards and the exercises come from these sources:

- **Cortex Documentation Portal – Get started with XQL** (language features, language structure, supported operators, datasets and presets). The portal is GitBook-based; every page is also available as Markdown by appending `.md`, and `llms.txt` is a full index.
- **Cortex XQL Command Reference Guide** – one page per stage (26) and per function (~150), with syntax, parameters, usage notes and worked examples on a `sample_xql_raw` dataset. This is the primary source for the engine semantics (for example: `config` must be first, `comp` is blocking, `join`/`union`/`dedup` lose sort order, `fields` allows no functions, default limits of 1,000,000 and 1,000, case-insensitive matching by default).
- **Cortex XQL Schema Reference** – `xdr_data` fields, split into the main list and per-actor pages (action, actor, causality, os actor); ~750 fields. The sample data only uses documented names.
- **Palo Alto Networks Beacon** – the official training platform; LIVEcommunity's "Where can I learn XQL?" thread and r/paloaltonetworks both point here for structured XQL courses (functions, operators, data types). Beacon requires an account, so this app complements it rather than replacing it.
- **Cortex Query Builder and Agentic Assistant** – the in-product IDE with auto-suggestions and natural-language-to-XQL. The Sandbox here imitates the useful part for learning (run, inspect each stage) without needing a tenant.
- **Cortex XSIAM data source pages** for the cloud and identity sources: Amazon S3 (CloudTrail lands in `amazon_aws_raw`; flow logs can be normalised into `xdr_data` network stories), Azure Event Hub (`msft_azure_raw`), Microsoft Entra ID, Azure Network Watcher flow logs, Prisma Access (`panw_ngfw_*_raw` with `is_prisma_mobile`), plus the **XSIAM Data Model schema** and the XDM mapping references for network and authentication events (`xdm.source.ipv4`, `xdm.event.outcome`, `XDM_CONST.OUTCOME_FAILED`, ...).
- **Practitioner notes** gathered while operating XSIAM in production and published as the open-source `cortex-xsiam-mcp-gateway` dataset catalogue: flow-log request/reply misreads, retroactive IOC alerts, array fields in `alerts`, the Entra `status` JSON, NSG duplicate deliveries, Snowflake's upper-case fields, GitHub EMU naming. These shaped units 13-17. Everything in this repository is fictional; no organisation's data or identifiers are included.
- **Community sources**: WWT's *Introduction to XQL: Writing Your First Query* (hypothesis → dataset → filter → comp/sort → visualise), the *Seven XQL queries to write before the XDR Analyst exam* article (config first, actor vs action, comp blocking, bin before comp, dedup by asc _time, join defaults, sub-queries in `in`), the PaloAltoNetworks `cortex-xql-queries` repository and the XQL Hub query collection (real-world patterns such as `json_extract_scalar` on Windows logs, `ENUM.FILE_WRITE`, `contains` chains and wildcard `=`).

Links to every source are in the Progress tab (`XQL.SOURCES` in `js/content/concepts.js`), and `docs/DOCUMENTATION_REVIEW.md`
goes through each source in more detail: what it covers, which rules were taken from it, and the gaps this app fills.

## Project layout

```
index.html            page shell; loads the scripts in order
privacy.html          what the site stores, for visitors and identity providers
css/styles.css        theme (dark and light), layout, components
js/engine/            lexer.js, parser.js, functions.js, evaluator.js  (the XQL subset interpreter)
js/data/datasets.js   the endpoint sample tenant and GeoIP table
js/data/datasets-tenant.js  the Acme Life (fictional) network, cloud, identity and alert datasets plus the XDM mappings
js/content/           concepts.js (units, reference cards, sources), exercises-1.js .. exercises-5.js (exercises-3.js is yours to extend)
js/app/               srs.js (scheduler + localStorage), ui.js (renderers), main.js (views and sessions)
test/                 engine.test.js, validate-exercises.js, run.js, server.test.mjs
docs/CONTENT_GUIDE.md how to write exercises that the validator accepts
serve.js              dependency-free static server (npm start)
server/               Cloudflare Worker: worker.js (router), lib.js (server-side grading, sessions, rate limits), api/ (handlers)
schema.sql            D1 tables for accounts and the leaderboard
wrangler.jsonc        Worker configuration (account, custom domain, bindings)
build.js, _headers    assemble dist/ for publishing; security headers served with the static files
scripts/check-public.js  refuses to publish if a secret or a client identifier is present
docs/DEPLOYMENT.md    how the site is hosted and how to run your own copy
```

## Adding exercises

Add objects to `js/content/exercises-3.js` following `docs/CONTENT_GUIDE.md`, then run `npm test`. The validator executes every
reference query, checks that each `predict` key matches what the engine returns, that each `bug` is observable, that each
`cloze` template is solvable with its answers, and that each `parsons` solution runs.

## Accounts and leaderboard (optional)

The published site offers passwordless sign-in (a one-time code by email, or GitHub, Google or Microsoft where the operator
has configured them) so that correct answers earn points and appear on a leaderboard. The server re-grades every submitted
answer with the same engine before awarding points, once per card. The leaderboard shows handles only, never names or email
addresses; accounts can be deleted from the Account page. Learning progress itself always stays in the browser, signed in or
not. See `docs/DEPLOYMENT.md` for exactly what is stored.

## Hosting your own copy

The site is a Cloudflare Worker serving the static app plus a small API (`server/`), with D1 for accounts. `npm run deploy`
builds `dist/`, runs the public-content check and deploys. Everything you need, including how to turn on each sign-in
method, is in `docs/DEPLOYMENT.md`.

## Contributing, security and licence

Contributions are welcome: see `CONTRIBUTING.md` (content guide, engine rules, tests) and `CODE_OF_CONDUCT.md`. Please report
security problems privately as described in `SECURITY.md`. The project is released under the MIT licence (`LICENSE`); see
`NOTICE.md` for trademarks and the provenance of the vendor references.

## Disclaimer

Not affiliated with Palo Alto Networks. Cortex, XSIAM and XDR are their trademarks. The data is fictional; the engine
implements the public syntax as documented and may differ from the product in edge cases.
