// XQL Tutor - exercise bank, part 1: pipeline, filter, fields, strings, enums, sort-limit.
// Every query, answer key and check below was computed by running it in the sandbox engine
// (node test/validate-exercises.js re-checks them all). Queries are written with String.raw so
// backslashes reach the XQL lexer exactly as typed.
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const Q = String.raw;
  const REF = 'https://cortex-docs.paloaltonetworks.com/xql-command-reference-guide/readme';
  const GS = 'https://cortex-docs.paloaltonetworks.com/cortex-xsiam/reference-and-developer-docs/cortex-agentix-xql/get-started-with-xql';
  const stage = (s) => `${REF}/stages/${s}`;
  const fn = (f) => `${REF}/functions/${f}`;
  const DOC = {
    structure: { title: 'XQL language structure', url: `${GS}/xql-language-structure` },
    stages: { title: 'Stages list', url: stage('stages-list') },
    dataset: { title: 'dataset stage', url: stage('dataset') },
    config: { title: 'config stage', url: stage('config') },
    filter: { title: 'filter stage', url: stage('filter') },
    operators: { title: 'Supported operators', url: `${GS}/supported-operators` },
    fields: { title: 'fields stage', url: stage('fields') },
    alter: { title: 'alter stage', url: stage('alter') },
    lowercase: { title: 'lowercase', url: fn('lowercase') },
    sort: { title: 'sort stage', url: stage('sort') },
    limit: { title: 'limit stage', url: stage('limit') },
    xdrFields: { title: 'xdr_data fields', url: 'https://cortex-docs.paloaltonetworks.com/xql-schema-reference/xdr-data-fields' },
    byActor: { title: 'Fields by actor', url: 'https://cortex-docs.paloaltonetworks.com/xql-schema-reference/xdr-data-fields-by-actor' },
  };

  XQL.EXERCISES = (XQL.EXERCISES || []).concat([
    // ===================================================================================
    // pipeline: anatomy of a query
    // ===================================================================================
    {
      id: 'pipeline-01', concept: 'pipeline', type: 'concept', difficulty: 1, title: 'Read a query top to bottom',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| fields _time, agent_hostname, action_process_image_name
| sort desc _time
| limit 5`,
      notes: [
        { line: 0, text: 'The data source. It comes first (only `config` may go before it) and hands all 71 rows of xdr_data to the next stage.' },
        { line: 1, text: '`filter` keeps only the rows where the condition is true: the 39 process-start events.' },
        { line: 2, text: '`fields` keeps three columns. Still 39 rows; only the columns shrink.' },
        { line: 3, text: '`sort desc _time` orders those 39 rows newest first.' },
        { line: 4, text: '`limit 5` keeps the first 5 rows it receives: the 5 newest process starts.' },
      ],
      prompt: 'What does the `fields` stage on line 3 receive as its input?',
      choices: [
        'The 39 process rows that passed the filter on line 2',
        'All 71 rows of xdr_data, because every stage reads the dataset again',
        'The 5 rows kept by `limit`, because limit always runs first',
        'The 39 process rows, already sorted newest first by line 4',
      ],
      answer: 0,
      explanation: 'Each stage works only on the rows the previous stage passed to it through the pipe `|`, so the order of the lines is the order of execution: `fields` sees the filtered rows before `sort` has run. Moving `limit 5` above `filter` would give a different answer.',
      docs: [DOC.structure, DOC.stages], tags: ['pipes', 'stage order'],
    },
    {
      id: 'pipeline-02', concept: 'pipeline', type: 'mcq', difficulty: 1, title: 'Pipes between stages',
      prompt: 'Which of these queries is syntactically valid?',
      choices: [
        '`dataset = xdr_data filter event_type = 1`',
        '`dataset = xdr_data | filter event_type = 1 | fields agent_hostname`',
        '`dataset = xdr_data | filter event_type = 1 |`',
        '`| dataset = xdr_data | filter event_type = 1`',
      ],
      answer: 1,
      explanation: 'Stages are separated by exactly one `|`: the data source comes first and every pipe is followed by another stage. A missing pipe, a leading pipe and a trailing (dangling) pipe are all syntax errors.',
      docs: [DOC.structure], tags: ['pipes', 'syntax'],
    },
    {
      id: 'pipeline-03', concept: 'pipeline', type: 'predict', difficulty: 2, title: 'No dataset stage',
      query: Q`filter agent_hostname = "LNX-BUILD-11"
| fields _time, actor_process_image_name, action_process_image_name`,
      prompt: 'This query has no `dataset` stage. What happens when you run it?',
      choices: [
        'It fails: every query must begin with `dataset =`',
        'It runs against `xdr_data` and returns the 3 LNX-BUILD-11 events',
        'It searches every dataset in the tenant and returns more than 3 rows',
        'It returns 0 rows because no data source was selected',
      ],
      answer: 1,
      check: { kind: 'rowCount', value: 3 },
      explanation: 'When no data source is named, Cortex queries the default dataset, `xdr_data` (an administrator can change the default in Dataset Management). Writing `dataset = xdr_data` explicitly still makes a saved query self-documenting.',
      docs: [DOC.dataset, DOC.structure], tags: ['default dataset'],
    },
    {
      id: 'pipeline-04', concept: 'pipeline', type: 'predict', difficulty: 2, title: 'Order of stages',
      query: Q`dataset = xdr_data
| sort asc _time
| limit 5
| filter event_type = ENUM.NETWORK`,
      prompt: 'The dataset contains 17 network events. How many rows does this query return?',
      choices: ['5: the five oldest network events', '0', '17: limit is ignored when a filter follows it', '1'],
      answer: 1,
      check: { kind: 'rowCount', value: 0 },
      explanation: 'Stages run in the order written: `limit 5` keeps the five oldest events of any type (all of them process starts), so the filter after it has no network rows left. Filter first, then sort and limit.',
      docs: [DOC.stages], tags: ['stage order'],
    },
    {
      id: 'pipeline-05', concept: 'pipeline', type: 'bug', difficulty: 2, title: 'Where config goes',
      prompt: 'This query should show the last 24 hours of process starts, but it does not run. Click the broken line.',
      query: Q`dataset = xdr_data
| config timeframe = 24h
| filter event_type = ENUM.PROCESS
| fields _time, agent_hostname, action_process_image_name`,
      bugLine: 1,
      expectError: true,
      fix: Q`config timeframe = 24h
| dataset = xdr_data
| filter event_type = ENUM.PROCESS
| fields _time, agent_hostname, action_process_image_name`,
      explanation: '`config` sets how the whole query runs (time frame, case sensitivity), so it must be the very first stage, before `dataset`. The data source comes second.',
      docs: [DOC.config], tags: ['config'],
    },
    {
      id: 'pipeline-06', concept: 'pipeline', type: 'parsons', difficulty: 3, title: 'Latest process starts on WS-FIN-042',
      task: 'Arrange the lines to list the 5 most recent process starts on WS-FIN-042, showing the time, the parent process and the process it started.',
      solution: Q`dataset = xdr_data
| filter agent_hostname = "WS-FIN-042"
| filter event_type = ENUM.PROCESS
| fields _time, actor_process_image_name, action_process_image_name
| sort desc _time
| limit 5`,
      distractors: ['| sort _time desc'],
      explanation: 'Source first, then filters (so later stages handle fewer rows), then the columns, then the sort, and `limit` last so it keeps the top 5 of the sorted rows. The two filter lines can go in either order. The direction goes before the field in `sort`.',
      docs: [DOC.structure, DOC.limit], tags: ['stage order'],
    },
    {
      id: 'pipeline-07', concept: 'pipeline', type: 'cloze', difficulty: 3, title: 'Settings, then source',
      task: 'Fill in the first two stage keywords so the query returns only file events from the last 24 hours.',
      template: Q`___ timeframe = 24h
| ___ = xdr_data
| filter event_type = ENUM.FILE // file events only
| fields _time, agent_hostname, action_file_path`,
      answers: [['config'], ['dataset']],
      solution: Q`config timeframe = 24h
| dataset = xdr_data
| filter event_type = ENUM.FILE // file events only
| fields _time, agent_hostname, action_file_path`,
      explanation: '`config timeframe = 24h` pins the time range inside the query text and must be the first stage; the `dataset` stage follows it. Here it keeps 7 of the 10 file events (the sandbox clock is frozen at 27 Oct 08:00 UTC).',
      docs: [DOC.config, DOC.dataset], tags: ['config', 'timeframe'],
    },
    {
      id: 'pipeline-08', concept: 'pipeline', type: 'cloze', difficulty: 3, title: 'Comment your hunt',
      task: 'Fill in the two comment markers: one opens a header comment that spans two lines, the other adds a note to the end of the second filter line. Comments are ignored when the query runs.',
      template: Q`___ Hunt: Office app spawning PowerShell (MITRE T1059.001)
   Owner: SOC tier 2 */
dataset = xdr_data
| filter actor_process_image_name in ("WINWORD.EXE", "EXCEL.EXE")
| filter action_process_image_name = "powershell.exe" ___ the child process
| fields agent_hostname, actor_process_image_name, action_process_image_command_line`,
      answers: [['/*'], ['//']],
      solution: Q`/* Hunt: Office app spawning PowerShell (MITRE T1059.001)
   Owner: SOC tier 2 */
dataset = xdr_data
| filter actor_process_image_name in ("WINWORD.EXE", "EXCEL.EXE")
| filter action_process_image_name = "powershell.exe" // the child process
| fields agent_hostname, actor_process_image_name, action_process_image_command_line`,
      explanation: '`/* ... */` comments can span several lines; `//` comments out the rest of one line. A `//` on the first line would leave the "Owner" line as live, invalid query text.',
      docs: [DOC.structure], tags: ['comments'],
    },
    {
      id: 'pipeline-09', concept: 'pipeline', type: 'write', difficulty: 3, title: 'What did the web server run?',
      task: 'SRV-WEB-02 looks compromised. List every process it started: return `_time`, `actor_process_image_name`, `action_process_image_name` and `action_process_image_command_line`, oldest first.',
      solution: Q`dataset = xdr_data
| filter agent_hostname = "SRV-WEB-02" and event_type = ENUM.PROCESS
| fields _time, actor_process_image_name, action_process_image_name, action_process_image_command_line
| sort asc _time`,
      hints: [
        'Stages: `dataset`, `filter` (host and event type), `fields`, `sort`.',
        Q`dataset = xdr_data
| filter agent_hostname = ___ and event_type = ___
| fields _time, ___
| sort ___ _time`,
        Q`dataset = xdr_data
| filter agent_hostname = "SRV-WEB-02" and event_type = ENUM.PROCESS
| fields _time, actor_process_image_name, action_process_image_name, action_process_image_command_line
| sort ___ _time`,
      ],
      explanation: 'Filter on host and event type first, then pick the columns, then sort. The IIS worker `w3wp.exe` spawning `cmd.exe`, `whoami` and a PowerShell download is a textbook web-shell pattern.',
      docs: [DOC.structure], tags: ['web shell'],
    },
    {
      id: 'pipeline-10', concept: 'pipeline', type: 'write', difficulty: 4, title: 'First connections of the last day',
      task: 'Use `config` to restrict the query to the last 24 hours, then return the first 5 network connections in that window: `_time`, `agent_hostname`, `action_remote_ip` and `action_remote_port`, oldest first.',
      solution: Q`config timeframe = 24h
| dataset = xdr_data
| filter event_type = ENUM.NETWORK
| fields _time, agent_hostname, action_remote_ip, action_remote_port
| sort asc _time
| limit 5`,
      hints: [
        'Stages in order: `config`, `dataset`, `filter`, `fields`, `sort`, `limit`.',
        Q`config timeframe = ___
| dataset = xdr_data
| filter event_type = ___
| fields _time, agent_hostname, action_remote_ip, action_remote_port
| sort ___
| limit ___`,
        Q`config timeframe = 24h
| dataset = xdr_data
| filter event_type = ENUM.NETWORK
| fields _time, agent_hostname, action_remote_ip, action_remote_port
| sort asc _time
| limit ___`,
      ],
      explanation: 'Without the `config` line, the oldest 5 connections of the whole dataset (20 to 25 Oct) would come back instead. With it, the window starts at 26 Oct 08:00 and the first rows are WS-FIN-042 talking to Office 365 and then to the C2.',
      docs: [DOC.config, DOC.limit], tags: ['config', 'timeframe'],
    },

    // ===================================================================================
    // filter: filtering rows
    // ===================================================================================
    {
      id: 'filter-01', concept: 'filter', type: 'concept', difficulty: 1, title: 'Comparisons joined with and',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_remote_port != 443 and action_total_upload > 1000000
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_remote_port, action_total_upload`,
      notes: [
        { line: 0, text: 'Start from the endpoint telemetry.' },
        { line: 1, text: 'Keep only network events (17 rows).' },
        { line: 2, text: 'Both conditions must be true: a port other than 443 AND more than 1,000,000 bytes uploaded. Numbers are written bare.' },
        { line: 3, text: 'Show the columns an analyst needs. One row survives: update.exe pushing 52 MB to the C2 on port 4444.' },
      ],
      prompt: 'Why is `443` written without quotes?',
      choices: [
        '`action_remote_port` holds numbers; numbers are written bare, and `"443"` would be a string, which does not compare with a number',
        'Quotes are optional in XQL; `443` and `"443"` mean the same thing',
        'Only text that contains spaces needs quotes',
        'Without quotes, XQL reads 443 as the name of a field',
      ],
      answer: 0,
      explanation: 'XQL is typed: integer fields such as ports, sizes and byte counts are compared with bare numbers, and text fields with double-quoted strings. `action_remote_port = "443"` is a type error, not a silent match.',
      docs: [DOC.filter, DOC.operators], tags: ['operators', 'types'],
    },
    {
      id: 'filter-02', concept: 'filter', type: 'mcq', difficulty: 1, title: 'Where the filter goes',
      query: Q`dataset = xdr_data
| sort desc _time
| fields _time, agent_hostname, event_type, action_process_image_name
| filter event_type = ENUM.PROCESS and agent_hostname = "WS-HR-017"`,
      prompt: 'This returns the right 9 rows. What should a reviewer change?',
      choices: [
        'Move the `filter` line up to directly after `dataset`, so `sort` and `fields` handle only the 9 matching rows instead of all 71',
        'Nothing: XQL reorders stages automatically, so placement never matters',
        'Split the condition into two `filter` stages; one `filter` cannot test two fields',
        'Move `fields` to the first line so the filter can see the columns',
      ],
      answer: 0,
      explanation: 'The vendor guidance is to filter as early as possible: every later stage then processes fewer rows, which matters on a dataset as large as xdr_data. Here the result is the same either way, but the cost is not.',
      docs: [DOC.filter], tags: ['filter early', 'performance'],
    },
    {
      id: 'filter-03', concept: 'filter', type: 'predict', difficulty: 2, title: 'and binds tighter than or',
      query: Q`dataset = xdr_data
| filter action_process_image_name = "powershell.exe" or action_process_image_name = "cmd.exe" and agent_hostname = "SRV-WEB-02"
| fields agent_hostname, actor_process_image_name, action_process_image_name`,
      prompt: 'powershell.exe was started 4 times (once on SRV-WEB-02) and cmd.exe 4 times (twice on SRV-WEB-02). How many rows does this return?',
      choices: ['3: only the SRV-WEB-02 rows', '6', '8: every powershell and cmd start', '2'],
      answer: 1,
      check: { kind: 'rowCount', value: 6 },
      explanation: '`and` is evaluated before `or`, so this reads "powershell anywhere OR (cmd.exe on SRV-WEB-02)": 4 + 2 = 6. To restrict both names to the web server, write `(... or ...) and agent_hostname = "SRV-WEB-02"`, which returns 3.',
      docs: [DOC.filter, DOC.operators], tags: ['precedence', 'parentheses'],
    },
    {
      id: 'filter-04', concept: 'filter', type: 'predict', difficulty: 2, title: 'Not US, or not known?',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_country != "US"
| fields agent_hostname, action_remote_ip, action_country`,
      prompt: 'Of the 17 network events, 6 go to the US and 4 internal connections have no country (null). How many rows come back?',
      choices: ['11', '7', '4', '17'],
      answer: 1,
      check: { kind: 'rowCount', value: 7 },
      explanation: '`!= "US"` is not true for a row whose country is null, so it silently drops the 4 internal connections. To keep them, ask for them explicitly: `action_country != "US" or action_country = null`.',
      docs: [DOC.filter], tags: ['null'],
    },
    {
      id: 'filter-05', concept: 'filter', type: 'bug', difficulty: 2, title: 'A quoted port',
      prompt: 'This should find the connection to port 4444, but it fails. Click the broken line.',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_remote_port = "4444"
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_total_upload`,
      bugLine: 2,
      expectError: true,
      fix: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_remote_port = 4444
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_total_upload`,
      explanation: '`action_remote_port` is an integer field, so compare it with the bare number `4444`; `"4444"` is a string and the comparison is a type error. Quote text, never numbers.',
      docs: [DOC.filter], tags: ['types'],
    },
    {
      id: 'filter-06', concept: 'filter', type: 'parsons', difficulty: 3, title: 'Large uploads to the internet',
      task: 'Arrange the lines to find network connections that uploaded more than 1,000,000 bytes to an external destination (one with a known country), biggest upload first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_total_upload > 1000000 and action_country != null
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_total_upload
| sort desc action_total_upload`,
      distractors: ['| filter action_total_upload > "1000000" and action_country != null'],
      explanation: '`!= null` is how XQL tests that a value is present, and the byte threshold is a bare number (the quoted version is a type error). Filtering before the sort means sort only orders the 2 matching rows: update.exe and AnyDesk.exe.',
      docs: [DOC.filter], tags: ['null', 'operators'],
    },
    {
      id: 'filter-07', concept: 'filter', type: 'cloze', difficulty: 3, title: 'Straight to an IP',
      task: 'Malware often connects to a raw IP address with no DNS lookup. Complete the filter: network events where `dns_query_name` is missing but the destination is external (`action_country` is present).',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter dns_query_name = ___ and action_country ___ null
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_country`,
      answers: [['null'], ['!=']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter dns_query_name = null and action_country != null
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_country`,
      explanation: 'Test for a missing value with `= null` and for a present one with `!= null`. All 6 hits are connections to the C2 192.0.2.45, from four different hosts.',
      docs: [DOC.filter], tags: ['null'],
    },
    {
      id: 'filter-08', concept: 'filter', type: 'cloze', difficulty: 3, title: 'Parentheses and not',
      task: 'Show process starts on WS-FIN-042 or WS-HR-017 whose parent is not explorer.exe. Fill in the two boolean keywords.',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter (agent_hostname = "WS-FIN-042" ___ agent_hostname = "WS-HR-017") and ___ actor_process_image_name = "explorer.exe"
| fields agent_hostname, actor_process_image_name, action_process_image_name`,
      answers: [['or'], ['not']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter (agent_hostname = "WS-FIN-042" or agent_hostname = "WS-HR-017") and not actor_process_image_name = "explorer.exe"
| fields agent_hostname, actor_process_image_name, action_process_image_name`,
      explanation: 'The parentheses make the host test one unit, so `and not ...` applies to both hosts; `not` negates the comparison right after it. Without the parentheses, the `and` would attach to the WS-HR-017 test only.',
      docs: [DOC.filter, DOC.operators], tags: ['precedence', 'not'],
    },
    {
      id: 'filter-09', concept: 'filter', type: 'write', difficulty: 3, title: 'Non-standard ports',
      task: 'Which network connections used a port other than 80 and 443? Return `_time`, `agent_hostname`, `actor_process_image_name`, `action_remote_ip` and `action_remote_port`, oldest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_remote_port != 80 and action_remote_port != 443
| fields _time, agent_hostname, actor_process_image_name, action_remote_ip, action_remote_port
| sort asc _time`,
      hints: [
        'Filter the event type, then exclude both ports with `!=` joined by `and`; then `fields` and `sort`.',
        Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_remote_port != ___ and action_remote_port != ___
| fields _time, agent_hostname, actor_process_image_name, action_remote_ip, action_remote_port
| sort ___ _time`,
        Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_remote_port != 80 and action_remote_port != 443
| fields _time, agent_hostname, actor_process_image_name, action_remote_ip, action_remote_port
| sort ___`,
      ],
      explanation: 'Joining the two `!=` tests with `or` would keep everything, because every port differs from at least one of 80 and 443; `action_remote_port not in (80, 443)` is the shorter equivalent. The 5 hits are PsExec over SMB, the 4444 exfil channel and the nmap scan.',
      docs: [DOC.filter, DOC.operators], tags: ['operators', 'lateral movement'],
    },
    {
      id: 'filter-10', concept: 'filter', type: 'write', difficulty: 4, title: 'Everything not going to the US',
      task: 'List network connections whose destination is not in the US, including internal destinations that have no country, but leave out the analyst\'s scanner LAPTOP-SEC-09. Return `_time`, `agent_hostname`, `action_remote_ip` and `action_country`, newest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter (action_country != "US" or action_country = null) and agent_hostname != "LAPTOP-SEC-09"
| fields _time, agent_hostname, action_remote_ip, action_country
| sort desc _time`,
      hints: [
        'Combine `!= "US"` with an explicit `= null` test inside parentheses, then `and` the host exclusion.',
        Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter (action_country != "US" or action_country = ___) and agent_hostname != ___
| fields _time, agent_hostname, action_remote_ip, action_country
| sort desc _time`,
        Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter (action_country != "US" or action_country = null) and agent_hostname != "LAPTOP-SEC-09"
| fields ___
| sort desc _time`,
      ],
      explanation: 'A null country fails `!= "US"`, so the `or action_country = null` branch is what brings back the PsExec SMB connection from SRV-DC-01. The parentheses make the host exclusion apply to both branches.',
      docs: [DOC.filter], tags: ['null', 'precedence'],
    },

    // ===================================================================================
    // fields: choosing columns
    // ===================================================================================
    {
      id: 'fields-01', concept: 'fields', type: 'concept', difficulty: 1, title: 'Pick and rename columns',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.FILE
| fields _time, agent_hostname as host, action_file_path, action_file_size
| sort desc action_file_size`,
      notes: [
        { line: 0, text: 'All endpoint events.' },
        { line: 1, text: 'Only file events (10 rows).' },
        { line: 2, text: '`fields` keeps four columns and renames `agent_hostname` to `host`. From this stage on, the old name no longer exists.' },
        { line: 3, text: 'Sort by a column that `fields` kept: the 48 GB backup image on SRV-DC-01 comes first.' },
      ],
      prompt: 'You add a fifth line to keep only SRV-DC-01. Which filter works?',
      choices: [
        '`| filter host = "SRV-DC-01"`',
        '`| filter agent_hostname = "SRV-DC-01"`',
        'Either one; the alias is only a display label',
        '`| filter agent_hostname as host = "SRV-DC-01"`',
      ],
      answer: 0,
      explanation: 'After `fields agent_hostname as host`, every later stage must use `host`; `agent_hostname` is gone. An alias is a real column name, not a display label.',
      docs: [DOC.fields], tags: ['alias'],
    },
    {
      id: 'fields-02', concept: 'fields', type: 'predict', difficulty: 1, title: 'Sort by an alias',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.FILE
| fields agent_hostname as host, action_file_name as file, action_file_size as bytes
| sort desc bytes
| limit 1`,
      prompt: 'What is the value of `file` in the single row returned?',
      choices: [
        'dc01-2026-10-22.vhdx',
        'customer_list_export.xlsx',
        'update.exe',
        'Nothing: the query fails because `sort` must use `action_file_size`',
      ],
      answer: 0,
      check: { kind: 'cell', row: 0, column: 'file', value: 'dc01-2026-10-22.vhdx' },
      explanation: 'Later stages refer to the alias, so `sort desc bytes` is correct and the largest file (the 48 GB backup on SRV-DC-01) comes first. Using the original name after renaming is what would fail.',
      docs: [DOC.fields], tags: ['alias'],
    },
    {
      id: 'fields-03', concept: 'fields', type: 'predict', difficulty: 2, title: 'The old name after as',
      query: Q`dataset = xdr_data
| fields agent_hostname as host, action_process_image_name
| filter agent_hostname = "SRV-WEB-02"`,
      prompt: 'What does this query return?',
      choices: [
        'The 6 SRV-WEB-02 events',
        '0 rows: no host is called agent_hostname',
        'An error: `agent_hostname` was renamed to `host`, so later stages must use `host`',
        'The 6 SRV-WEB-02 events, with both a `host` and an `agent_hostname` column',
      ],
      answer: 2,
      check: { kind: 'error' },
      explanation: 'The vendor rule: once you use `as`, all subsequent stages must refer to the field by its alias. Write `filter host = "SRV-WEB-02"`, or better, put the filter before `fields` so it runs early.',
      docs: [DOC.fields], tags: ['alias'],
    },
    {
      id: 'fields-04', concept: 'fields', type: 'mcq', difficulty: 2, title: 'Dropping one column',
      prompt: 'Your query ends with `| fields agent_hostname, actor_process_image_name, action_process_image_name, action_process_image_command_line`. You want the same output without the command line. What do you add?',
      choices: [
        'A new stage: `| fields - action_process_image_command_line`',
        'Change the stage to `fields agent_hostname, -action_process_image_command_line, ...`',
        '`| filter action_process_image_command_line = null`',
        '`| alter action_process_image_command_line = null`',
      ],
      answer: 0,
      explanation: 'Exclusion is `fields -` in a stage of its own: select the wider set first, then remove columns with a second `fields` stage, because `-` cannot be mixed into a selection list. The `filter` option removes rows instead of a column, and `alter ... = null` leaves an empty column behind.',
      docs: [DOC.fields], tags: ['exclude'],
    },
    {
      id: 'fields-05', concept: 'fields', type: 'bug', difficulty: 2, title: 'A function in fields',
      prompt: 'The goal is to flag command lines longer than 150 characters, a common sign of encoded payloads. Click the broken line.',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| fields len(action_process_image_command_line) as cmd_len
| filter cmd_len > 150
| fields agent_hostname, action_process_image_name, cmd_len`,
      bugLine: 2,
      expectError: true,
      fix: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| alter cmd_len = len(action_process_image_command_line)
| filter cmd_len > 150
| fields agent_hostname, action_process_image_name, cmd_len`,
      explanation: '`fields` does not allow functions and cannot create values; computed columns come from `alter`. With `alter` the other columns also survive until the final `fields` picks them.',
      docs: [DOC.fields, DOC.alter], tags: ['no functions'],
    },
    {
      id: 'fields-06', concept: 'fields', type: 'parsons', difficulty: 3, title: 'Friendly column names',
      task: 'Arrange the lines to list the files written on WS-HR-017 with the columns `_time`, `file` (the file name) and `size` (bytes), largest first.',
      solution: Q`dataset = xdr_data
| filter agent_hostname = "WS-HR-017"
| filter event_type = ENUM.FILE
| fields _time, action_file_name as file, action_file_size as size
| sort desc size`,
      distractors: ['| sort desc action_file_size'],
      explanation: 'Once `fields` renames `action_file_size` to `size`, the sort must use `size`; the original name no longer exists. The macro_helper.ps1 written by Excel is the file to investigate.',
      docs: [DOC.fields], tags: ['alias'],
    },
    {
      id: 'fields-07', concept: 'fields', type: 'cloze', difficulty: 3, title: 'Wildcard in, hash out',
      task: 'Return the host and every `action_file_*` column for file events, except the SHA256. Fill in the wildcard selection and the exclusion operator.',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.FILE
| fields agent_hostname, ___
| fields ___ action_file_sha256`,
      answers: [['action_file_*'], ['-']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.FILE
| fields agent_hostname, action_file_*
| fields - action_file_sha256`,
      explanation: '`action_file_*` selects every column that starts with that prefix (name, path, extension, size, sha256); a second stage, `fields -`, then removes one of them. Exclusion needs its own stage after the selection.',
      docs: [DOC.fields], tags: ['wildcard', 'exclude'],
    },
    {
      id: 'fields-08', concept: 'fields', type: 'cloze', difficulty: 3, title: 'Rename, then use the new name',
      task: 'Rename the parent and child process columns to `parent` and `child`, then keep only the rows where the child is whoami.exe.',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| fields agent_hostname, actor_process_image_name ___ parent, action_process_image_name as child
| filter ___ = "whoami.exe"`,
      answers: [['as'], ['child']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| fields agent_hostname, actor_process_image_name as parent, action_process_image_name as child
| filter child = "whoami.exe"`,
      explanation: '`as` gives a column a new name, and from that stage on only the new name exists, so the filter tests `child`. Both hits (WS-FIN-042 and SRV-WEB-02) are an attacker checking which account they landed in.',
      docs: [DOC.fields], tags: ['alias'],
    },
    {
      id: 'fields-09', concept: 'fields', type: 'write', difficulty: 3, title: 'PowerShell, readable',
      task: 'For every PowerShell process start, return three columns named `host`, `user` and `cmd` (from `agent_hostname`, `actor_effective_username` and `action_process_image_command_line`), newest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and action_process_image_name = "powershell.exe"
| fields agent_hostname as host, actor_effective_username as user, action_process_image_command_line as cmd
| sort desc _time`,
      hints: [
        'Filter on the event type and `action_process_image_name`, rename with `as` inside `fields`, then `sort desc _time`.',
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and action_process_image_name = ___
| fields agent_hostname as ___, actor_effective_username as ___, action_process_image_command_line as ___
| sort desc _time`,
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and action_process_image_name = "powershell.exe"
| fields agent_hostname as host, actor_effective_username as user, action_process_image_command_line as cmd
| sort ___`,
      ],
      explanation: '`_time` is a system field that `fields` cannot remove, so `sort desc _time` still works after `fields`. Compare the hidden, encoded command on WS-FIN-042 and the execution-policy bypass on WS-HR-017 with the analyst\'s inventory script.',
      docs: [DOC.fields], tags: ['alias', 'system fields'],
    },
    {
      id: 'fields-10', concept: 'fields', type: 'write', difficulty: 4, title: 'Registry review',
      task: 'For registry events, return the host renamed to `host` plus every `action_registry_*` column except `action_registry_key_name`, sorted by `host` A to Z.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.REGISTRY
| fields agent_hostname as host, action_registry_*
| fields - action_registry_key_name
| sort asc host`,
      hints: [
        'Two `fields` stages: one selects (with an alias and a wildcard), the next excludes. Sort on the alias.',
        Q`dataset = xdr_data
| filter event_type = ENUM.REGISTRY
| fields agent_hostname as host, ___
| fields - ___
| sort asc ___`,
        Q`dataset = xdr_data
| filter event_type = ENUM.REGISTRY
| fields agent_hostname as host, action_registry_*
| fields - action_registry_key_name
| sort ___`,
      ],
      explanation: 'A wildcard plus a second `fields -` stage keeps the column set tidy without listing every name, and the sort has to use the alias `host`. Two of the three values are Run-key persistence (update.exe, AnyDesk); the third enables Office macros without a prompt.',
      docs: [DOC.fields], tags: ['wildcard', 'exclude', 'alias'],
    },

    // ===================================================================================
    // strings: matching text
    // ===================================================================================
    {
      id: 'strings-01', concept: 'strings', type: 'concept', difficulty: 1, title: 'Substring matching',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line contains "http://"
| fields agent_hostname, action_process_image_name, action_process_image_command_line`,
      notes: [
        { line: 0, text: 'Endpoint telemetry.' },
        { line: 1, text: 'Process starts only, the rows where the command line is populated.' },
        { line: 2, text: '`contains` is a substring test: true when the text appears anywhere in the field. 4 command lines fetch something over plain HTTP.' },
        { line: 3, text: 'Show who ran what.' },
      ],
      prompt: 'Which other filter returns exactly the same rows here?',
      choices: [
        '`action_process_image_command_line = "*http://*"`',
        '`action_process_image_command_line = "http://"`',
        '`action_process_image_command_line ~= "^http://"`',
        '`action_process_image_command_line in ("http://")`',
      ],
      answer: 0,
      explanation: 'With `=`, a `*` inside the quoted string is a wildcard for any run of characters, so `"*http://*"` means "contains". Without wildcards, `=` and `in` must match the whole value, and `^` anchors a regex to the start of the command line.',
      docs: [DOC.operators, DOC.filter], tags: ['contains', 'wildcard'],
    },
    {
      id: 'strings-02', concept: 'strings', type: 'predict', difficulty: 1, title: 'Upper or lower case?',
      query: Q`dataset = xdr_data
| filter action_process_image_name = "POWERSHELL.EXE"
| fields agent_hostname, actor_process_image_name, action_process_image_name`,
      prompt: 'The data stores the name as `powershell.exe` in lower case. How many rows come back?',
      choices: ['0', '4', '1', 'An error: a string must match the stored case'],
      answer: 1,
      check: { kind: 'rowCount', value: 4 },
      explanation: 'XQL compares string values case-insensitively unless the query starts with `config case_sensitive = true`, so all 4 PowerShell starts match. Do not rely on it if the same logic may run with case sensitivity switched on.',
      docs: [DOC.config], tags: ['case'],
    },
    {
      id: 'strings-03', concept: 'strings', type: 'predict', difficulty: 2, title: 'case_sensitive = true',
      query: Q`config case_sensitive = true
| dataset = xdr_data
| filter action_process_image_name in ("winword.exe", "EXCEL.EXE")
| fields agent_hostname, action_process_image_name`,
      prompt: 'The data has one `WINWORD.EXE` start and two `EXCEL.EXE` starts, all stored in capitals. How many rows?',
      choices: ['3', '2', '0', '1'],
      answer: 1,
      check: { kind: 'rowCount', value: 2 },
      explanation: 'With `config case_sensitive = true`, `"winword.exe"` no longer matches `WINWORD.EXE`; only the two exact-case `EXCEL.EXE` rows survive. Wrap the field in `lowercase()` and compare with lower-case values when a match must ignore this setting.',
      docs: [DOC.config, DOC.lowercase], tags: ['case', 'config'],
    },
    {
      id: 'strings-04', concept: 'strings', type: 'predict', difficulty: 2, title: 'A regex is unanchored',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line ~= "cmd.exe"
| fields agent_hostname, actor_process_image_name, action_process_image_command_line`,
      prompt: 'Four command lines start with `cmd.exe`. How many rows does this regex filter return?',
      choices: ['4', '6', '2', '0: the regex needs `.*` at both ends'],
      answer: 1,
      check: { kind: 'rowCount', value: 6 },
      explanation: '`~=` finds the pattern anywhere in the value, so it also matches the two `PsExec.exe \\\\host ... cmd.exe` lines on SRV-DC-01. Anchor it with `^` (and escape the dot: `"^cmd\\.exe"`) to match only command lines that begin with cmd.exe; `!~=` keeps the rows that do not match.',
      docs: [DOC.operators], tags: ['regex'],
    },
    {
      id: 'strings-05', concept: 'strings', type: 'bug', difficulty: 2, title: 'Single quotes',
      prompt: 'This should list what the IIS worker process started. Click the line the parser rejects.',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter actor_process_image_name = 'w3wp.exe'
| fields agent_hostname, action_process_image_name, action_process_image_command_line`,
      bugLine: 2,
      expectError: true,
      fix: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter actor_process_image_name = "w3wp.exe"
| fields agent_hostname, action_process_image_name, action_process_image_command_line`,
      explanation: 'XQL string literals use double quotes (`"w3wp.exe"`), or triple double quotes for text that itself contains quotes; single quotes do not delimit strings.',
      docs: [DOC.filter], tags: ['quotes', 'syntax'],
    },
    {
      id: 'strings-06', concept: 'strings', type: 'parsons', difficulty: 3, title: 'LOLBins and PsExec',
      task: 'Arrange the lines to list starts of certutil.exe, mshta.exe or any PsExec component (`PsExec.exe`, `PSEXESVC.exe`), with time, host, process and command line, oldest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_name in ("certutil.exe", "mshta.exe", "psexe*")
| fields _time, agent_hostname, action_process_image_name, action_process_image_command_line
| sort asc _time`,
      distractors: ['| filter action_process_image_name contains ("certutil.exe", "mshta.exe", "psexe*")'],
      explanation: '`in (...)` tests a list of values and accepts `*` wildcards in its string items; with the default case-insensitive matching, `"psexe*"` catches both PsExec.exe and PSEXESVC.exe. `contains` takes one value, not a list.',
      docs: [DOC.operators], tags: ['in', 'wildcard'],
    },
    {
      id: 'strings-07', concept: 'strings', type: 'cloze', difficulty: 3, title: 'Case-proof matching',
      task: 'This query runs with `config case_sensitive = true`. Without touching that line, find the events whose acting process is any PsExec component, however its name is capitalised.',
      template: Q`config case_sensitive = true
| dataset = xdr_data
| filter ___(actor_process_image_name) ___ "psexe"
| fields agent_hostname, actor_process_image_name, action_process_image_name, action_remote_ip`,
      answers: [['lowercase'], ['contains', '~=']],
      solution: Q`config case_sensitive = true
| dataset = xdr_data
| filter lowercase(actor_process_image_name) contains "psexe"
| fields agent_hostname, actor_process_image_name, action_process_image_name, action_remote_ip`,
      explanation: '`lowercase()` normalises the field, so a lower-case search string matches whatever case is stored; the vendor\'s own example is `lowercase(actor_process_image_name) contains "psexec"`. It finds the PsExec SMB connection on SRV-DC-01 and the PSEXESVC service starting cmd.exe on WS-HR-017.',
      docs: [DOC.lowercase, DOC.config], tags: ['case', 'contains'],
    },
    {
      id: 'strings-08', concept: 'strings', type: 'cloze', difficulty: 3, title: 'Quotes inside the string',
      task: 'The scheduled-task command line contains `/tn "WindowsUpdateCheck"` with real double quotes, which an ordinary `"..."` string cannot hold. Fill in the delimiters that allow it.',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line contains ___/tn "WindowsUpdateCheck" /tr___
| fields agent_hostname, actor_process_image_name, action_process_image_command_line`,
      answers: [['"""'], ['"""']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line contains """/tn "WindowsUpdateCheck" /tr"""
| fields agent_hostname, actor_process_image_name, action_process_image_command_line`,
      explanation: 'Triple double quotes delimit a string that may contain `"` and that interprets escape sequences such as `\\\\` and `\\n`; text in single double quotes is taken literally. The match is the persistence task that update.exe created.',
      docs: [DOC.filter], tags: ['triple quotes'],
    },
    {
      id: 'strings-09', concept: 'strings', type: 'write', difficulty: 3, title: 'Downloads from a raw IP',
      task: 'Which process command lines fetch something from a URL that uses a bare IPv4 address (`http://` or `https://` followed by digits)? Match the scheme in any letter case, because `HTTP://` works just as well for an attacker. Return `_time`, `agent_hostname`, `action_process_image_name` and `action_process_image_command_line`, oldest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line ~= "(?i)https?://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"
| fields _time, agent_hostname, action_process_image_name, action_process_image_command_line
| sort asc _time`,
      hints: [
        'Use the regex operator `~=` on the command line. It is case-sensitive, so start the pattern with `(?i)`; `s?` makes the s optional and `[0-9]+\\.` matches one octet and its dot.',
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line ~= "(?i)___"
| fields _time, agent_hostname, action_process_image_name, action_process_image_command_line
| sort asc _time`,
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_command_line ~= "(?i)https?://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"
| fields ___
| sort asc _time`,
      ],
      explanation: '`~=` matches a regular expression anywhere in the value, which suits a URL buried in a longer command line, but unlike `=` and `contains` it is case-sensitive: the `(?i)` prefix is what makes `HTTP://` match too. All five hits point at 192.0.2.45: the web server first (23 Oct), then the finance, Mac and sales hosts on 26 Oct.',
      docs: [DOC.operators], tags: ['regex', 'c2'],
    },
    {
      id: 'strings-10', concept: 'strings', type: 'write', difficulty: 4, title: 'Executed from Temp or Downloads',
      task: 'Which processes ran from a user\'s Temp or Downloads folder? Return `_time`, `agent_hostname`, `actor_effective_username` and `action_process_image_path`, newest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path in ("*\AppData\Local\Temp*", "*\Downloads*")
| fields _time, agent_hostname, actor_effective_username, action_process_image_path
| sort desc _time`,
      hints: [
        'Match `action_process_image_path` against a list of wildcard patterns with `in (...)`. In an ordinary double-quoted string a backslash is just a backslash.',
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path in ("*___*", "*___*")
| fields _time, agent_hostname, actor_effective_username, action_process_image_path
| sort desc _time`,
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_path in ("*\AppData\Local\Temp*", "*\Downloads*")
| fields ___
| sort desc _time`,
      ],
      explanation: 'A wildcard list inside `in` reads like a watch list and is case-insensitive by default, and single double quotes keep Windows backslashes literal. The hits are update.exe on WS-FIN-042 and AnyDesk.exe on WS-SALES-023.',
      docs: [DOC.operators, DOC.filter], tags: ['in', 'wildcard', 'paths'],
    },

    // ===================================================================================
    // enums: the xdr_data model
    // ===================================================================================
    {
      id: 'enums-01', concept: 'enums', type: 'concept', difficulty: 1, title: 'Actor, action, causality',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and agent_hostname = "WS-FIN-042"
| fields _time, actor_process_image_name, action_process_image_name, causality_actor_process_image_name
| sort asc _time`,
      notes: [
        { line: 0, text: 'xdr_data mixes process, network, file, registry and image-load events in one table.' },
        { line: 1, text: '`event_type = ENUM.PROCESS` (the same as `event_type = 1`) keeps process starts only.' },
        { line: 2, text: 'actor = the process that did something (the parent); action = what it did (here, the child process it started); causality actor = the root of the whole chain.' },
        { line: 3, text: 'Read it top to bottom: explorer.exe starts OUTLOOK.EXE, then OUTLOOK.EXE -> WINWORD.EXE -> powershell.exe -> cmd, certutil, update.exe; every row of that chain has causality actor OUTLOOK.EXE.' },
      ],
      prompt: 'In the row where powershell.exe starts certutil.exe, which column holds `powershell.exe`?',
      choices: ['`actor_process_image_name`', '`action_process_image_name`', '`causality_actor_process_image_name`', 'All three'],
      answer: 0,
      explanation: 'The actor performs the action, so the parent is in `actor_*` and the child it launched is in `action_*`. `causality_actor_*` stays OUTLOOK.EXE for the whole chain because that is where the attack entered.',
      docs: [DOC.byActor], tags: ['actor', 'action', 'causality'],
    },
    {
      id: 'enums-02', concept: 'enums', type: 'mcq', difficulty: 1, title: 'ENUM names and numbers',
      prompt: 'Which pair of filters always returns the same rows?',
      choices: [
        '`event_type = ENUM.FILE` and `event_type = 3`',
        '`event_type = ENUM.FILE` and `event_sub_type = ENUM.FILE_WRITE`',
        '`event_type = 3` and `event_type = "3"`',
        '`event_type = ENUM.PROCESS` and `event_type = 3`',
      ],
      answer: 0,
      explanation: '`event_type` is an integer and `ENUM.FILE` is the readable name for 3 (PROCESS = 1, NETWORK = 2, FILE = 3, REGISTRY = 4, LOAD_IMAGE = 6). `"3"` is a string, which does not compare with an integer, and `FILE_WRITE` is only one sub type of file events.',
      docs: [DOC.xdrFields], tags: ['event_type'],
    },
    {
      id: 'enums-03', concept: 'enums', type: 'predict', difficulty: 2, title: 'Sub types',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.FILE and event_sub_type = ENUM.FILE_CREATE_NEW
| fields agent_hostname, actor_process_image_name, action_file_name`,
      prompt: 'The dataset has 10 file events. How many rows does this return?',
      choices: ['10', '4', '6', '0: ENUM names only work with event_type'],
      answer: 1,
      check: { kind: 'rowCount', value: 4 },
      explanation: '`event_sub_type` refines `event_type`: file events split into sub types such as `FILE_CREATE_NEW` (4 here: AnyDesk.exe, update.exe, macro_helper.ps1, m.sh) and `FILE_WRITE` (the other 6). Newly created files are the set to start from when hunting droppers.',
      docs: [DOC.xdrFields], tags: ['event_sub_type'],
    },
    {
      id: 'enums-04', concept: 'enums', type: 'predict', difficulty: 2, title: 'The causality chain',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter causality_actor_process_image_name = "OUTLOOK.EXE"
| fields _time, actor_process_image_name, action_process_image_name`,
      prompt: 'OUTLOOK.EXE itself started exactly one process (WINWORD.EXE). How many rows does this return?',
      choices: ['1', '7', '16', '2'],
      answer: 1,
      check: { kind: 'rowCount', value: 7 },
      explanation: 'The causality actor is the root of the chain, so every descendant (WINWORD, powershell, cmd, whoami, certutil, update.exe, schtasks) carries OUTLOOK.EXE in that column, not only its direct child. Without the event_type filter you would get 16 rows, including the chain\'s network, file, registry and image-load events.',
      docs: [DOC.byActor], tags: ['causality'],
    },
    {
      id: 'enums-05', concept: 'enums', type: 'bug', difficulty: 2, title: 'Parent or child?',
      prompt: 'The goal is to list the processes that WINWORD.EXE launched (its children), but the query returns WINWORD.EXE itself. Click the wrong line.',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter action_process_image_name = "WINWORD.EXE"
| fields agent_hostname, actor_process_image_name, action_process_image_name, action_process_image_command_line`,
      bugLine: 2,
      fix: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter actor_process_image_name = "WINWORD.EXE"
| fields agent_hostname, actor_process_image_name, action_process_image_name, action_process_image_command_line`,
      explanation: 'To find what a process launched, put it on the actor side: `actor_process_image_name = "WINWORD.EXE"`. Filtering on `action_process_image_name` finds the moment WINWORD.EXE was itself started (by OUTLOOK.EXE).',
      docs: [DOC.byActor], tags: ['actor', 'action'],
    },
    {
      id: 'enums-06', concept: 'enums', type: 'parsons', difficulty: 3, title: 'The web-shell tree',
      task: 'Arrange the lines to show every process start in the chain rooted at the IIS worker `w3wp.exe`, with parent, child and command line, in time order.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| filter causality_actor_process_image_name = "w3wp.exe"
| fields _time, actor_process_image_name, action_process_image_name, action_process_image_command_line
| sort asc _time`,
      distractors: ['| filter actor_process_image_name = "w3wp.exe"'],
      explanation: 'Filtering on `causality_actor_process_image_name` returns the whole tree (4 rows, including whoami and PowerShell launched by cmd.exe); filtering on the actor would return only w3wp.exe\'s direct children (2 rows).',
      docs: [DOC.byActor], tags: ['causality', 'web shell'],
    },
    {
      id: 'enums-07', concept: 'enums', type: 'cloze', difficulty: 3, title: 'Registry values by name',
      task: 'Return the registry values that were set, using ENUM names rather than numbers for both the event type and the sub type.',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.___ and event_sub_type = ENUM.___
| fields agent_hostname, actor_process_image_name, action_registry_value_name, action_registry_data`,
      answers: [['REGISTRY'], ['REGISTRY_SET_VALUE']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.REGISTRY and event_sub_type = ENUM.REGISTRY_SET_VALUE
| fields agent_hostname, actor_process_image_name, action_registry_value_name, action_registry_data`,
      explanation: 'ENUM names keep a hunt readable: `ENUM.REGISTRY` is event type 4 and `ENUM.REGISTRY_SET_VALUE` is the sub type for writing a value. Two of the three hits are Run-key persistence.',
      docs: [DOC.xdrFields], tags: ['event_type', 'event_sub_type'],
    },
    {
      id: 'enums-08', concept: 'enums', type: 'cloze', difficulty: 3, title: 'Non-Windows network activity',
      task: 'Show the network connections made by hosts that are not Windows. `agent_os_type` is an enum too.',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.___ and agent_os_type != ENUM.___
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_external_hostname`,
      answers: [['NETWORK'], ['AGENT_OS_WINDOWS']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and agent_os_type != ENUM.AGENT_OS_WINDOWS
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_external_hostname`,
      explanation: '`agent_os_type` is 1 for Windows, 2 for macOS and 4 for Linux (`ENUM.AGENT_OS_WINDOWS`, `ENUM.AGENT_OS_MAC`, `ENUM.AGENT_OS_LINUX`). Filter the event type first: network fields such as `action_remote_ip` are null on every other kind of event.',
      docs: [DOC.xdrFields], tags: ['agent_os_type'],
    },
    {
      id: 'enums-09', concept: 'enums', type: 'write', difficulty: 3, title: 'Unsigned binaries',
      task: 'Which process starts launched an unsigned image? `action_process_signature_status` is an integer enum in which 3 means unsigned. Return `_time`, `agent_hostname`, `action_process_image_name` and `action_process_image_path`, newest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and action_process_signature_status = 3
| fields _time, agent_hostname, action_process_image_name, action_process_image_path
| sort desc _time`,
      hints: [
        'Filter on the process event type and on the signature status (a bare number), then `fields` and `sort desc _time`.',
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and action_process_signature_status = ___
| fields _time, agent_hostname, action_process_image_name, action_process_image_path
| sort ___ _time`,
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and action_process_signature_status = 3
| fields _time, agent_hostname, action_process_image_name, action_process_image_path
| sort ___`,
      ],
      explanation: 'Signature status is stored as a number (1 signed, 2 signed but invalid, 3 unsigned, 4 failed to obtain), so it is compared with a bare integer. update.exe in a user Temp folder stands out among the expected unsigned macOS and Linux tools.',
      docs: [DOC.xdrFields], tags: ['signature'],
    },
    {
      id: 'enums-10', concept: 'enums', type: 'write', difficulty: 4, title: 'Network traffic of the phishing chain',
      task: 'Which network connections belong to the attack chain that started in OUTLOOK.EXE? Return `_time`, `agent_hostname`, the process that opened the connection (`actor_process_image_name`), `action_remote_ip` and `action_remote_port`, oldest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and causality_actor_process_image_name = "OUTLOOK.EXE"
| fields _time, agent_hostname, actor_process_image_name, action_remote_ip, action_remote_port
| sort asc _time`,
      hints: [
        'On a network event the actor is the process that opened the connection, and the causality actor is still the root of its chain.',
        Q`dataset = xdr_data
| filter event_type = ___ and causality_actor_process_image_name = ___
| fields _time, agent_hostname, actor_process_image_name, action_remote_ip, action_remote_port
| sort asc _time`,
        Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and causality_actor_process_image_name = "OUTLOOK.EXE"
| fields ___
| sort asc _time`,
      ],
      explanation: 'Combining `ENUM.NETWORK` with the causality actor returns every connection the chain made, whichever descendant made it: the PowerShell beacon, the certutil download and update.exe\'s exfil on 4444. OUTLOOK.EXE\'s own connection to Office 365 is not part of it, because its causality actor is explorer.exe.',
      docs: [DOC.byActor, DOC.xdrFields], tags: ['causality', 'network'],
    },

    // ===================================================================================
    // sort-limit: ordering and limiting
    // ===================================================================================
    {
      id: 'sort-limit-01', concept: 'sort-limit', type: 'concept', difficulty: 1, title: 'Top N',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| fields agent_hostname, actor_process_image_name, action_remote_ip, action_total_upload
| sort desc action_total_upload
| limit 3`,
      notes: [
        { line: 0, text: 'Endpoint telemetry.' },
        { line: 1, text: 'Network events only (17 rows).' },
        { line: 2, text: 'Four columns.' },
        { line: 3, text: '`sort desc action_total_upload`: the direction comes first, then the field. Biggest uploads first.' },
        { line: 4, text: '`limit 3` keeps the first three rows it receives: the top three uploaders.' },
      ],
      prompt: 'What changes if you swap the last two lines (`limit 3` before `sort`)?',
      choices: [
        'You get 3 arbitrary connections, sorted by upload, instead of the 3 largest',
        'Nothing: XQL always sorts before it limits',
        'The query fails: limit must be the last stage',
        'You get the 3 smallest uploads',
      ],
      answer: 0,
      explanation: '`limit` keeps the first N rows of whatever arrives, so it only means "top N" after a `sort`. The same applies after `join`, `union` and `dedup`, which do not preserve order: sort after them, then limit.',
      docs: [DOC.sort, DOC.limit], tags: ['top n'],
    },
    {
      id: 'sort-limit-02', concept: 'sort-limit', type: 'mcq', difficulty: 1, title: 'Default row limits',
      prompt: 'You run `dataset = xdr_data | fields agent_hostname, action_process_image_name` in the Query Builder with no `limit` stage. What is the most it can return?',
      choices: ['1,000 rows', '1,000,000 rows', '100 rows', 'There is no limit'],
      answer: 0,
      explanation: 'A basic query with no stages beyond `fields` is capped at 1,000 results by default; any other query defaults to 1,000,000. The 1,000 cap does not apply to widgets, correlation rules, the public API, or saved and scheduled queries.',
      docs: [DOC.limit], tags: ['default limit'],
    },
    {
      id: 'sort-limit-03', concept: 'sort-limit', type: 'predict', difficulty: 2, title: 'Two sort keys',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and action_country != null
| fields agent_hostname, action_country, action_total_upload
| sort desc action_country, asc action_total_upload
| limit 1`,
      prompt: 'Which host is in the first row?',
      choices: ['WS-FIN-042', 'LNX-BUILD-11', 'MAC-DESIGN-03', 'WS-SALES-023'],
      answer: 1,
      check: { kind: 'cell', row: 0, column: 'agent_hostname', value: 'LNX-BUILD-11' },
      explanation: 'The first key decides: `desc action_country` puts US before DE, and only rows that tie on country are ordered by the second key, `asc action_total_upload`. MAC-DESIGN-03 has the smallest upload overall (512 bytes) but sits in the DE group.',
      docs: [DOC.sort], tags: ['multi-key'],
    },
    {
      id: 'sort-limit-04', concept: 'sort-limit', type: 'predict', difficulty: 2, title: 'Where nulls sort',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| fields agent_hostname, action_remote_ip, action_external_hostname
| sort asc action_external_hostname
| limit 1`,
      prompt: 'What is `action_external_hostname` in the first row?',
      choices: ['192.0.2.45', 'get.docker.com', 'null (no hostname)', 'WS-FIN-042'],
      answer: 2,
      check: { kind: 'cell', row: 0, column: 'action_external_hostname', value: 'null' },
      explanation: 'In the sandbox, rows with no value come first in an ascending sort, so two nmap scan targets with no hostname lead the list. The vendor reference does not document where nulls sort, so add `filter action_external_hostname != null` before the sort whenever you want real values at the top.',
      docs: [DOC.sort], tags: ['null'],
    },
    {
      id: 'sort-limit-05', concept: 'sort-limit', type: 'bug', difficulty: 2, title: 'Direction after the field',
      prompt: 'This should return the three largest files written. Click the line XQL rejects.',
      query: Q`dataset = xdr_data
| filter event_type = ENUM.FILE
| fields _time, agent_hostname, action_file_path, action_file_size
| sort action_file_size desc
| limit 3`,
      bugLine: 3,
      expectError: true,
      fix: Q`dataset = xdr_data
| filter event_type = ENUM.FILE
| fields _time, agent_hostname, action_file_path, action_file_size
| sort desc action_file_size
| limit 3`,
      explanation: 'In XQL the direction comes before the field: `sort desc action_file_size`. The SQL habit `ORDER BY x DESC` is the usual cause of this error.',
      docs: [DOC.sort], tags: ['syntax'],
    },
    {
      id: 'sort-limit-06', concept: 'sort-limit', type: 'parsons', difficulty: 3, title: 'Latest C2 contacts',
      task: 'Arrange the lines to list the 4 most recent connections to the C2 address 192.0.2.45, newest first, with time, host and remote port.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK
| filter action_remote_ip = "192.0.2.45"
| fields _time, agent_hostname, action_remote_port
| sort desc _time
| limit 4`,
      distractors: ['| sort _time desc'],
      explanation: 'Filter first, then `sort desc _time`, then `limit 4`. With `limit` above `sort` you would keep 4 arbitrary C2 connections instead of the newest four.',
      docs: [DOC.sort, DOC.limit], tags: ['top n'],
    },
    {
      id: 'sort-limit-07', concept: 'sort-limit', type: 'cloze', difficulty: 3, title: 'Host A to Z, newest first',
      task: 'Order process starts by host name A to Z and, within each host, newest first. Keep the first 5 rows.',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| fields _time, agent_hostname, action_process_image_name
| sort ___ agent_hostname, ___ _time
| limit 5`,
      answers: [['asc'], ['desc']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS
| fields _time, agent_hostname, action_process_image_name
| sort asc agent_hostname, desc _time
| limit 5`,
      explanation: 'Each sort key carries its own direction: `sort asc agent_hostname, desc _time` orders hosts alphabetically and each host\'s rows newest first. The 5 rows are LAPTOP-SEC-09\'s three starts followed by LNX-BUILD-11\'s two.',
      docs: [DOC.sort], tags: ['multi-key'],
    },
    {
      id: 'sort-limit-08', concept: 'sort-limit', type: 'cloze', difficulty: 3, title: 'First contact with the C2',
      task: 'When did any host first talk to 192.0.2.45? Fill in the sort direction and the limit so that only the earliest connection is returned.',
      template: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and action_remote_ip = "192.0.2.45"
| fields _time, agent_hostname, actor_process_image_name, action_remote_port
| sort ___ _time
| limit ___`,
      answers: [['asc'], ['1']],
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and action_remote_ip = "192.0.2.45"
| fields _time, agent_hostname, actor_process_image_name, action_remote_port
| sort asc _time
| limit 1`,
      explanation: '`sort asc _time | limit 1` returns the first-seen event. Here it is SRV-WEB-02 on 23 Oct, three days before the phishing on WS-FIN-042, which changes the incident timeline.',
      docs: [DOC.sort, DOC.limit], tags: ['first seen'],
    },
    {
      id: 'sort-limit-09', concept: 'sort-limit', type: 'write', difficulty: 3, title: 'Last commands as SYSTEM',
      task: 'What were the three most recent processes started by a process running as `NT AUTHORITY\\SYSTEM` (`actor_effective_username`)? Return `_time`, `agent_hostname` and `action_process_image_command_line`, newest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and actor_effective_username = "NT AUTHORITY\SYSTEM"
| fields _time, agent_hostname, action_process_image_command_line
| sort desc _time
| limit 3`,
      hints: [
        'Filter process starts on `actor_effective_username`, then `fields`, `sort desc _time` and `limit 3`.',
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and actor_effective_username = ___
| fields _time, agent_hostname, action_process_image_command_line
| sort ___ _time
| limit ___`,
        Q`dataset = xdr_data
| filter event_type = ENUM.PROCESS and actor_effective_username = "NT AUTHORITY\SYSTEM"
| fields _time, agent_hostname, action_process_image_command_line
| sort desc _time
| limit ___`,
      ],
      explanation: 'Sort newest first, then limit. The top three show a backdoor account being created and added to the local Administrators group on WS-HR-017 right after the PsExec service started; in a plain double-quoted string the backslash in `NT AUTHORITY\\SYSTEM` is literal.',
      docs: [DOC.sort, DOC.limit], tags: ['top n', 'persistence'],
    },
    {
      id: 'sort-limit-10', concept: 'sort-limit', type: 'write', difficulty: 4, title: 'Biggest uploads without DNS',
      task: 'Direct-to-IP exfiltration skips DNS. Among network connections with no `dns_query_name`, which three uploaded the most? Return `_time`, `agent_hostname`, `actor_process_image_name`, `action_remote_ip` and `action_total_upload`, largest first.',
      solution: Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and dns_query_name = null
| fields _time, agent_hostname, actor_process_image_name, action_remote_ip, action_total_upload
| sort desc action_total_upload
| limit 3`,
      hints: [
        'Filter on the event type and `dns_query_name = null`, choose the columns, `sort desc action_total_upload`, then `limit 3`.',
        Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and dns_query_name = ___
| fields _time, agent_hostname, actor_process_image_name, action_remote_ip, action_total_upload
| sort ___
| limit ___`,
        Q`dataset = xdr_data
| filter event_type = ENUM.NETWORK and dns_query_name = null
| fields _time, agent_hostname, actor_process_image_name, action_remote_ip, action_total_upload
| sort desc action_total_upload
| limit ___`,
      ],
      explanation: 'Filter, then sort, then limit: the top three are taken from the right rows in the right order. update.exe\'s 52 MB to the C2 on port 4444 leads, ahead of the PowerShell beacon and the PsExec SMB session.',
      docs: [DOC.sort, DOC.limit], tags: ['top n', 'exfiltration', 'null'],
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : this);
