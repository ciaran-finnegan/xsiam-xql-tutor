# XQL documentation review (27 October 2026)

What exists for learning Cortex XQL, what each source is good for, and how it shaped this app.

## 1. Vendor sources

### Cortex Documentation Portal – Get started with XQL
- URL: https://cortex-docs.paloaltonetworks.com/cortex-xsiam/reference-and-developer-docs/cortex-agentix-xql/get-started-with-xql (XSIAM 3.x) and the Cortex XDR 5.x equivalent.
- Covers: language features (queries are pipelines of stages separated by `|`; `xdr_data` is the default dataset; joins, unions, aggregations, presets, XDM queries), language structure (comments `//` and `/* */`), **supported operators** (`=`, `!=`, `<`, `<=`, `>`, `>=`, `and/or/not`, `in` / `not in` with `*` wildcards, `contains`, `~=` regex, `incidr` / `incidr6` with comma-separated CIDR lists), datasets and presets.
- Useful detail: the portal is GitBook-based. Appending `.md` to any page URL returns clean Markdown, and `https://cortex-docs.paloaltonetworks.com/llms.txt` indexes every page. This is the fastest way to read the docs without the JavaScript UI.
- Weakness for a learner: it is a reference, not a course. Nothing makes you practise.

### Cortex XQL Command Reference Guide
- URL: https://cortex-docs.paloaltonetworks.com/xql-command-reference-guide/readme (stages list, functions list, JSON functions reference).
- Covers: 26 stages (`alter, arrayexpand, bin, call, comp, config, dataset, dedup, fields, filter, iploc, join, limit, pivot, preset, replacenull, search, sort, tag, target, top, transaction, transpose, union, view, windowcomp`) and about 150 functions, each with syntax, parameter table, return value, **usage notes** and worked examples on a small `sample_xql_raw` dataset.
- The usage notes are the most valuable learning content Palo Alto publishes. The ones encoded in the tutor's engine, reference cards and exercises:
  - `config` must be the first stage; matching is case-insensitive unless `config case_sensitive = true`; timeframe units s, m, h, d, w, mo, y and `between "-30m" and "now"`.
  - `dataset` must be first (after `config`); names are case-insensitive; `dataset in (...)`, `cold_dataset =`, `preset =`.
  - `filter` early; parentheses for precedence; `null` and `""` tests; single quotes are literal, triple quotes process escapes; sub-queries inside `in (...)`.
  - `fields` allows no functions; aliases must be used from then on; `fields - x` excludes; wildcards `event_*`; system fields such as `_time` cannot be excluded.
  - `alter` is the only stage that creates fields; new columns are appended last.
  - `comp` is blocking and drops everything except the `by` fields and the aggregates; always alias; `bin` before `comp` for time charts.
  - `sort` direction comes before the field; `join`, `union` and `dedup` do not preserve order; `limit` after `sort`.
  - `limit` defaults: 1,000,000 rows, or 1,000 for a bare dataset/fields query.
  - `dedup ... by asc|desc field` chooses which duplicate survives; it is expensive on `xdr_data`.
  - `join` defaults to `type = inner` and `conflict_strategy = right`; the sub-query needs an alias and the condition uses `alias.field`.
  - `top` is approximate; `target` must be last; `windowcomp` keeps every row and allows one function per stage; `search` must be first and cannot be followed by aggregations.
  - `concat` accepts strings only (`to_string` first); `json_extract_scalar` returns text; `regextract` returns the first capture group; `timestamp_diff(a, b, part)` is a − b; `extract_time` is always GMT.

### Cortex XQL Schema Reference
- URL: https://cortex-docs.paloaltonetworks.com/xql-schema-reference/xdr-data-fields plus the per-actor pages (action, actor, causality, os actor).
- Covers: about 750 `xdr_data` fields with type and description, including the integer enums (`event_type`: Process 1, Network 2, File 3, Registry 4, Injection 5, LoadImage 6 ...; `agent_os_type`: Windows 1, macOS 2, Linux 4; signature status: Signed 1, SignedInvalid 2, Unsigned 3).
- Used to pick the field names and enum values in the sample tenant so that nothing in the app teaches a field that does not exist.

### Palo Alto Networks Beacon
- URL: https://beacon.paloaltonetworks.com/
- The official training platform. LIVEcommunity's "Where can I learn XQL?" thread (and r/paloaltonetworks) point to Beacon courses on XQL functions, operators, data types and query building. Requires an account; content is video and lab based.
- Complementary to this app: Beacon explains, the tutor drills.

### Query Builder and Agentic Assistant (in product)
- Documented at the XDR 5.x "Create and run XQL queries with Agentic Assistant chat" and Cortex Cloud "How to build XQL queries" pages.
- The in-tenant IDE provides auto-suggestion, inline definitions, schema browsing and natural-language-to-XQL. The tutor's Sandbox reproduces the part that matters for learning (run, see each stage's rows, browse the schema) without a tenant, and the exercises are designed so that what you practise here transfers directly to the Query Builder.

## 2. Community sources

- **WWT, "Introduction to XQL: Writing Your First Query" (Nov 2024)** – a worked investigation (DNS requests by one user): hypothesis → `dataset = xdr_data` → `fields` → `filter dns_query_name != null` → `filter` on the user → `comp count(...) as attempts by dns_query_name` → `sort desc attempts` → pie chart → save to the Query Library. Good model for the "analyst question → query" framing used in the write exercises.
- **"Cortex XDR Analyst Exam: Seven XQL Queries to Write Before You Book It" (dev.to, Oct 2026)** – seven progressively harder queries (process listing, Office → PowerShell, rare hashes with `count_distinct` by hash, `bin` + `comp` per hour, `dedup ... by asc _time` for first-seen, `join` to a lookup, `in (sub-query)` for IOC hashes) with the vendor gotchas spelled out. Several of the tutor's unit storylines mirror these patterns.
- **PaloAltoNetworks/cortex-xql-queries (GitHub)** – a small official sample set; the brute-force example demonstrates `json_extract_scalar` on `microsoft_windows_raw`, `comp count(), max(_time)`, `join conflict_strategy = both` and `timestamp_diff`.
- **XQL Hub (intrusus-dev/xql-hub, GitHub)** – community hunting queries in YAML with MITRE mappings. Shows idiomatic practitioner XQL: `filter event_type = ENUM.PROCESS`, `event_sub_type in (ENUM.FILE_WRITE, ...)`, chains of `contains`, wildcard `=` on command lines, `json_extract` on device info.
- **LIVEcommunity** – Q&A threads (dedup, summarising by hostname, "please share your useful XQL queries"); useful for seeing the mistakes real users make, which fed the distractor choices in the quiz cards.

## 3. Gaps the app fills

| Gap in the available material | What the tutor does about it |
|---|---|
| Reference pages explain but never ask you anything | Every card is a retrieval task; reading is limited to short annotated worked examples. |
| No way to practise without a tenant | An in-browser XQL interpreter over a fictional tenant with a frozen clock. |
| Examples use a toy `sample_xql_raw` dataset | The sample tenant uses real `xdr_data` field names and realistic attack storylines, plus `microsoft_windows_raw`, firewall logs and lookups. |
| Gotchas are scattered across 26 stage pages | They are turned into bug, predict and cloze cards, and repeated by the spaced-repetition scheduler until they stick. |
| Nothing tells you when to revisit a topic | SM-2 scheduling with interleaved review sessions. |
| Beacon needs an account and time | Ten-minute sessions, no login, progress stored locally. |

## 4. Learning-science basis

- Retrieval practice and the testing effect: Roediger & Karpicke (2006); Dunlosky, Rawson, Marsh, Nathan & Willingham (2013) rate practice testing and distributed practice as the two high-utility techniques.
- Spacing and interleaving: Cepeda et al. (2006) meta-analysis; Rohrer (2012); Carpenter, Pan & Butler (2022, *Nature Reviews Psychology*).
- Worked examples, completion problems and fading: Sweller's cognitive-load work; Renkl & Atkinson on fading.
- Parsons problems: Ericson et al. (2022) systematic literature review; Hou, Ericson & Wang (2023) on Parsons problems as scaffolding for code writing; Zhi et al. on efficiency.
- PRIMM (Predict, Run, Investigate, Modify, Make): Sentance, Waite & Kallia (2019).
- Feedback: Hattie & Timperley (2007).
