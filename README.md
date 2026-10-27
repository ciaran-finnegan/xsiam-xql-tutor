# XQL Tutor

A small web app that teaches **Cortex XQL** (the query language of Palo Alto Networks Cortex XSIAM and Cortex XDR) by making you
read and write queries. No build step, no dependencies, no account: everything runs in the browser against a fictional
one-week tenant, and your written queries are graded by actually executing them.

```bash
npm start
```

Then open <http://127.0.0.1:8765/>. (Any static file server works too, for example `python3 -m http.server 8765`.)
Run `npm test` to execute the engine tests and re-validate every exercise against the engine.

## What you get

| Tab | What it does |
|---|---|
| **Learn** | 12 units in a deliberate order (pipeline → filter → fields → text matching → the xdr_data model → sort/limit → comp → alter → time → dedup → join/union → hunting toolkit). Each unit has ten cards that progress from reading to writing: 120 cards in all, every one validated against the engine. |
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

- Stages: `config` (case_sensitive, timeframe), `dataset` / `preset`, `filter`, `fields`, `alter`, `comp`, `sort`, `limit`, `dedup`, `bin`, `join`, `union`, `replacenull`, `arrayexpand`, `top`, `windowcomp`, `iploc`, `tag`, `target`, `view`. `transaction`, `search`, `call`, `pivot` and `transpose` are parsed and explained but not executed.
- Operators: `= != < <= > >= in contains ~= !~= incidr`, `and or not`, wildcards with `*`, `null`, `ENUM.PROCESS`-style values, sub-queries inside `in (...)`, `//` and `/* */` comments, triple-quoted strings.
- ~60 functions (string, array, JSON, time, IP, math) and the comp aggregates (`count`, `count_distinct`, `sum`, `avg`, `min`, `max`, `median`, `values`, `list`, `earliest`, `latest`, `first`, `last`).
- Error messages are written to teach: unknown fields suggest the closest name, a field dropped by `comp` or renamed by `fields` says so, `sort _time desc` explains that the direction goes first, comparing a numeric field with `"443"` explains the type mismatch.

Known deviations from the product, all deliberate: the clock is frozen at 2026-10-27 08:00 UTC, `top` is exact rather than
approximate, regex matching with `~=` is unanchored (use `^` and `$`), and the result grid shows only the columns you selected.

## The sample tenant

`js/data/datasets.js` holds 71 `xdr_data` rows for eight hosts (a phishing chain on a finance workstation, an Excel macro,
a PsExec lateral movement from the domain controller, a web shell, an analyst's legitimate nmap scan, a macOS credential
dialog, a CI server), 15 Windows event log rows (`microsoft_windows_raw`, with the EventData as a JSON string), 14 firewall
sessions (`panw_ngfw_traffic_raw`) and three lookups (`hva_hosts`, `ioc_hashes`, `user_directory`). Field names and
`event_type` values follow the Cortex schema reference. `docs/CONTENT_GUIDE.md` describes the storylines.

## Documentation review

The syntax, semantics and gotchas encoded in the engine, the reference cards and the exercises come from these sources:

- **Cortex Documentation Portal – Get started with XQL** (language features, language structure, supported operators, datasets and presets). The portal is GitBook-based; every page is also available as Markdown by appending `.md`, and `llms.txt` is a full index.
- **Cortex XQL Command Reference Guide** – one page per stage (26) and per function (~150), with syntax, parameters, usage notes and worked examples on a `sample_xql_raw` dataset. This is the primary source for the engine semantics (for example: `config` must be first, `comp` is blocking, `join`/`union`/`dedup` lose sort order, `fields` allows no functions, default limits of 1,000,000 and 1,000, case-insensitive matching by default).
- **Cortex XQL Schema Reference** – `xdr_data` fields, split into the main list and per-actor pages (action, actor, causality, os actor); ~750 fields. The sample data only uses documented names.
- **Palo Alto Networks Beacon** – the official training platform; LIVEcommunity's "Where can I learn XQL?" thread and r/paloaltonetworks both point here for structured XQL courses (functions, operators, data types). Beacon requires an account, so this app complements it rather than replacing it.
- **Cortex Query Builder and Agentic Assistant** – the in-product IDE with auto-suggestions and natural-language-to-XQL. The Sandbox here imitates the useful part for learning (run, inspect each stage) without needing a tenant.
- **Community sources**: WWT's *Introduction to XQL: Writing Your First Query* (hypothesis → dataset → filter → comp/sort → visualise), the *Seven XQL queries to write before the XDR Analyst exam* article (config first, actor vs action, comp blocking, bin before comp, dedup by asc _time, join defaults, sub-queries in `in`), the PaloAltoNetworks `cortex-xql-queries` repository and the XQL Hub query collection (real-world patterns such as `json_extract_scalar` on Windows logs, `ENUM.FILE_WRITE`, `contains` chains and wildcard `=`).

Links to every source are in the Progress tab (`XQL.SOURCES` in `js/content/concepts.js`), and `docs/DOCUMENTATION_REVIEW.md`
goes through each source in more detail: what it covers, which rules were taken from it, and the gaps this app fills.

## Project layout

```
index.html            page shell; loads the scripts in order
css/styles.css        theme (dark and light), layout, components
js/engine/            lexer.js, parser.js, functions.js, evaluator.js  (the XQL subset interpreter)
js/data/datasets.js   the sample tenant and GeoIP table
js/content/           concepts.js (units, reference cards, sources), exercises-1.js, exercises-2.js, exercises-3.js
js/app/               srs.js (scheduler + localStorage), ui.js (renderers), main.js (views and sessions)
test/                 engine.test.js, validate-exercises.js, run.js
docs/CONTENT_GUIDE.md how to write exercises that the validator accepts
serve.js              dependency-free static server (npm start)
```

## Adding exercises

Add objects to `js/content/exercises-3.js` following `docs/CONTENT_GUIDE.md`, then run `npm test`. The validator executes every
reference query, checks that each `predict` key matches what the engine returns, that each `bug` is observable, that each
`cloze` template is solvable with its answers, and that each `parsons` solution runs.

## Disclaimer

Not affiliated with Palo Alto Networks. Cortex, XSIAM and XDR are their trademarks. The data is fictional; the engine
implements the public syntax as documented and may differ from the product in edge cases.
