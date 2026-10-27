// XQL Tutor - exercise bank, part 2: comp, alter, time, dedup, join-union, advanced.
// Every query runs against js/data/datasets.js; check with `node test/validate-exercises.js`.
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const REF = 'https://cortex-docs.paloaltonetworks.com/xql-command-reference-guide/readme';
  const st = (s, title) => ({ title: title || `${s} stage`, url: `${REF}/stages/${s}` });
  const fn = (f, title) => ({ title: title || `${f}()`, url: `${REF}/functions/${f}` });
  // queries are written indented for readability; Q() strips the indentation (one stage per line)
  const Q = (s) => s.trim().split('\n').map((l) => l.trim()).join('\n');

  XQL.EXERCISES = (XQL.EXERCISES || []).concat([
    // ===================================================================================
    // comp
    // ===================================================================================
    {
      id: 'comp-01', concept: 'comp', type: 'concept', difficulty: 2, title: 'One row per group',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | comp count() as starts, count_distinct(agent_hostname) as hosts by action_process_image_name
        | sort desc hosts
        | limit 3`),
      notes: [
        { line: 0, text: 'Endpoint telemetry from the XDR agent.' },
        { line: 1, text: 'Process starts only, so every row is one launched process.' },
        { line: 2, text: 'One output row per `action_process_image_name`. `count()` counts the rows in each group, `count_distinct(agent_hostname)` counts unique hosts. Every other field is dropped here.' },
        { line: 3, text: 'Sort on an alias: after comp the aliases and the by field are the only columns left.' },
        { line: 4, text: '`limit` after `sort` gives a real top 3: powershell.exe (4 hosts), then chrome.exe and cmd.exe (3 each).' },
      ],
      prompt: 'After the `comp` stage, which field can a later stage still use?',
      choices: ['`agent_hostname`', '`hosts`', '`_time`', '`action_process_image_command_line`'],
      answer: 1,
      explanation: 'comp is a blocking stage that keeps only the by fields and the aggregates, so `action_process_image_name`, `starts` and `hosts` survive. `agent_hostname` was only the argument of `count_distinct`, and system fields such as `_time` are discarded too.',
      docs: [st('comp'), fn('count_distinct')],
    },
    {
      id: 'comp-02', concept: 'comp', type: 'predict', difficulty: 2, title: 'Hosts that started PowerShell',
      query: Q(`
        dataset = xdr_data
        | filter action_process_image_name = "powershell.exe"
        | comp count() as starts by agent_hostname`),
      prompt: 'How many rows does this query return?',
      choices: ['1', '4', '5', '8'],
      answer: 1,
      check: { kind: 'rowCount', value: 4 },
      explanation: 'comp returns one row per distinct value of the by field, and only for values that occur. powershell.exe was started on four hosts (WS-FIN-042, WS-HR-017, SRV-WEB-02, LAPTOP-SEC-09); hosts that never ran it get no row at all, not a row with 0.',
      docs: [st('comp')],
    },
    {
      id: 'comp-03', concept: 'comp', type: 'predict', difficulty: 3, title: 'count() versus count(field)',
      query: Q(`
        dataset = xdr_data
        | filter agent_hostname = "WS-FIN-042"
        | comp count() as events, count(action_remote_ip) as conns`),
      prompt: 'What is the value of `conns`?',
      choices: ['21', '5', '3', '0, because there is no by clause'],
      answer: 1,
      check: { kind: 'cell', row: 0, column: 'conns', value: 5 },
      explanation: '`count()` counts rows (21 events), while `count(field)` counts only rows where the field is not null. `action_remote_ip` is set only on network events and WS-FIN-042 has five (Outlook, Chrome and three to 192.0.2.45). Without a by clause comp returns one summary row.',
      docs: [fn('count_with_comp_stage', 'count()')],
    },
    {
      id: 'comp-04', concept: 'comp', type: 'predict', difficulty: 3, title: 'Sorting after comp',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | comp sum(action_total_upload) as upload_bytes by agent_hostname
        | sort desc _time`),
      prompt: 'What happens when this runs?',
      choices: ['Hosts come back with the most recently active first', 'It fails: `_time` no longer exists after comp', 'The sort is skipped and the rows come back unordered', 'It sorts by `upload_bytes`, the only numeric column left'],
      answer: 1,
      check: { kind: 'error' },
      explanation: 'The vendor reference is explicit that comp removes every field that is not in the by clause or an aggregate, system fields like `_time` included. To order hosts by recent activity, aggregate the time: `comp ..., max(_time) as last_seen by agent_hostname | sort desc last_seen`.',
      docs: [st('comp'), fn('count_with_comp_stage', 'count()')],
    },
    {
      id: 'comp-05', concept: 'comp', type: 'bug', difficulty: 3, title: 'Filtering after the group',
      prompt: 'This should total the bytes WS-FIN-042 uploaded to each destination. Click the broken line.',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | comp sum(action_total_upload) as upload_bytes by action_remote_ip
        | filter agent_hostname = "WS-FIN-042"
        | sort desc upload_bytes`),
      bugLine: 3,
      expectError: true,
      fix: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and agent_hostname = "WS-FIN-042"
        | comp sum(action_total_upload) as upload_bytes by action_remote_ip
        | sort desc upload_bytes`),
      explanation: 'After comp only `action_remote_ip` and `upload_bytes` exist, so a filter on `agent_hostname` fails. Filter raw fields before comp (it is cheaper, too) and after comp only on by fields or aggregates.',
      docs: [st('comp'), fn('sum_with_comp_stage', 'sum()')],
    },
    {
      id: 'comp-06', concept: 'comp', type: 'parsons', difficulty: 3, title: 'Rare unsigned binaries',
      task: 'Prevalence hunt: among unsigned process images (`action_process_signature_status = 3`), find the SHA256 values that ran on exactly one host, with their image paths, ordered by hash.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS and action_process_signature_status = 3
        | comp count_distinct(agent_hostname) as hosts, values(action_process_image_path) as paths by action_process_image_sha256
        | filter hosts = 1
        | sort asc action_process_image_sha256`),
      distractors: ['| filter count_distinct(agent_hostname) = 1'],
      explanation: 'Rare and unsigned is a cheap, effective triage: update.exe in a Temp folder and the build server\'s bash surface, while curl (two hosts) drops out. The threshold has to test the alias after comp: aggregate functions such as `count_distinct()` run only inside comp (or windowcomp), never in filter.',
      docs: [st('comp'), fn('count_distinct'), fn('values')],
    },
    {
      id: 'comp-07', concept: 'comp', type: 'cloze', difficulty: 3, title: 'First and last C2 contact',
      task: 'For every host that talked to the C2 address 192.0.2.45, return when it first and last connected and how many connections it made.',
      template: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | comp ___(_time) as first_seen, ___(_time) as last_seen, count() as conns by agent_hostname`),
      answers: [['min', 'earliest', 'first'], ['max', 'latest', 'last']],
      solution: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | comp min(_time) as first_seen, max(_time) as last_seen, count() as conns by agent_hostname`),
      explanation: '`min(_time)` and `max(_time)` are the standard first-seen / last-seen pair, because timestamps compare chronologically. WS-FIN-042 made three connections between 09:12:30 and 09:15:05 on 26 Oct; the other three hosts connected once.',
      docs: [fn('min_with_comp_stage', 'min()'), fn('max_with_comp_stage', 'max()')],
    },
    {
      id: 'comp-08', concept: 'comp', type: 'cloze', difficulty: 4, title: 'Destinations shared by several hosts',
      task: 'Which remote IPs were contacted by more than one host? Return the number of distinct hosts and the list of their names for each.',
      template: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | comp ___(agent_hostname) as hosts, ___(agent_hostname) as host_list by action_remote_ip
        | filter hosts > 1
        | sort desc hosts`),
      answers: [['count_distinct'], ['values']],
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | comp count_distinct(agent_hostname) as hosts, values(agent_hostname) as host_list by action_remote_ip
        | filter hosts > 1
        | sort desc hosts`),
      explanation: '`count_distinct` counts unique hosts per destination and `values` collects the unique names into an array; `count` would count connections and `list` would repeat WS-FIN-042 three times for the C2. Only 192.0.2.45 (4 hosts) and Outlook\'s 52.96.166.98 (2 hosts) are shared.',
      docs: [fn('count_distinct'), fn('values')],
    },
    {
      id: 'comp-09', concept: 'comp', type: 'write', difficulty: 4, title: 'Upload volume per external destination',
      task: 'Exfiltration triage: for network events to external destinations (`action_country` is not null), return `action_remote_ip`, `conns` (number of connections), `hosts` (number of distinct hosts) and `upload_bytes` (total `action_total_upload`), largest upload first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | comp count() as conns, count_distinct(agent_hostname) as hosts, sum(action_total_upload) as upload_bytes by action_remote_ip
        | sort desc upload_bytes`),
      hints: [
        'Stages: `filter` (network events with a country), `comp` with `count()`, `count_distinct()` and `sum()` by `action_remote_ip`, then `sort`.',
        '`dataset = xdr_data | filter event_type = ENUM.NETWORK and action_country != null | comp count() as conns, ___(agent_hostname) as hosts, ___(action_total_upload) as upload_bytes by ___ | sort desc upload_bytes`',
        '`... | comp count() as conns, count_distinct(agent_hostname) as hosts, sum(action_total_upload) as upload_bytes by action_remote_ip | sort desc upload_bytes`',
      ],
      explanation: '192.0.2.45 tops the list with 52,739,360 bytes from four hosts, almost all of it update.exe\'s 50 MB push to port 4444; the AnyDesk relay is second with 8 MB. Summing upload per destination is the quickest way to find an exfiltration channel.',
      docs: [st('comp'), fn('sum_with_comp_stage', 'sum()')],
    },
    {
      id: 'comp-10', concept: 'comp', type: 'write', difficulty: 5, title: 'What did Office and IIS spawn?',
      task: 'Office applications and web servers should rarely start other programs. For process starts whose parent (`actor_process_image_name`) is WINWORD.EXE, EXCEL.EXE, OUTLOOK.EXE or w3wp.exe, return `agent_hostname`, `actor_process_image_name`, `children` (the distinct child image names), `starts` (number of starts) and `first_seen` (earliest `_time`), oldest first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS and actor_process_image_name in ("WINWORD.EXE", "EXCEL.EXE", "OUTLOOK.EXE", "w3wp.exe")
        | comp values(action_process_image_name) as children, count() as starts, min(_time) as first_seen by agent_hostname, actor_process_image_name
        | sort asc first_seen`),
      hints: [
        'Stages: `filter` with `in (...)` on the parent name, `comp values(), count(), min(_time)` by host and parent, `sort`.',
        '`dataset = xdr_data | filter event_type = ENUM.PROCESS and actor_process_image_name in (___) | comp ___(action_process_image_name) as children, count() as starts, ___(_time) as first_seen by agent_hostname, actor_process_image_name | sort asc first_seen`',
        '`... | comp values(action_process_image_name) as children, count() as starts, min(_time) as first_seen by agent_hostname, actor_process_image_name | sort asc first_seen`',
      ],
      explanation: 'Grouping by host and parent gives a compact triage table: WINWORD.EXE and EXCEL.EXE each started powershell.exe, OUTLOOK.EXE opened the malicious .docm in Word, and w3wp.exe started cmd.exe twice (the web shell). `first_seen` is the pivot time for each timeline.',
      docs: [st('comp'), fn('values')],
    },

    // ===================================================================================
    // alter
    // ===================================================================================
    {
      id: 'alter-01', concept: 'alter', type: 'concept', difficulty: 2, title: 'Deriving new columns',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | alter dest = concat(action_remote_ip, ":", to_string(action_remote_port)), scope = if(action_country = null, "internal", "external")
        | fields agent_hostname, actor_process_image_name, dest, scope
        | sort asc dest`),
      notes: [
        { line: 0, text: 'Endpoint telemetry.' },
        { line: 1, text: 'Network connections only.' },
        { line: 2, text: 'One alter stage can create several fields. `concat()` joins strings, so the numeric port goes through `to_string()`; `if()` returns its second argument when the condition is true and its third otherwise. `action_country = null` is the explicit null test, true for internal destinations.' },
        { line: 3, text: '`fields` picks the output columns, including the new ones. It cannot call functions itself: computing values is what alter is for.' },
        { line: 4, text: 'Sort by the derived `dest` text.' },
      ],
      prompt: 'Why is `action_remote_port` wrapped in `to_string()`?',
      choices: ['`concat()` accepts only strings and does no implicit conversion', '`to_string()` strips leading zeros from the port', 'Without it the port would be added to the IP arithmetically', 'It is only style; `concat()` converts numbers on its own'],
      answer: 0,
      explanation: 'Per the vendor reference, concat() strictly accepts string parameters and never converts other types, so numbers, booleans and timestamps need `to_string()` first. If any argument is null, concat returns null.',
      docs: [st('alter'), fn('concat'), fn('if')],
    },
    {
      id: 'alter-02', concept: 'alter', type: 'predict', difficulty: 2, title: 'Pulling a part out of a hostname',
      query: Q(`
        dataset = xdr_data
        | alter device_class = arrayindex(split(agent_hostname, "-"), 0)
        | comp count() as events by device_class`),
      prompt: 'Hostnames follow the pattern CLASS-ROLE-NN (WS-FIN-042, SRV-DC-01, LNX-BUILD-11, ...). How many rows does this return?',
      choices: ['1', '3', '5', '8'],
      answer: 2,
      check: { kind: 'rowCount', value: 5 },
      explanation: '`split(agent_hostname, "-")` turns WS-FIN-042 into ["WS", "FIN", "042"], and `arrayindex()` counts from 0, so index 0 is the device class: WS, SRV, LAPTOP, MAC and LNX make five groups. Index 1 would give the role (one value per host, so 8 rows), -1 gives the last element, and an index past the end returns null.',
      docs: [fn('split'), fn('arrayindex')],
    },
    {
      id: 'alter-03', concept: 'alter', type: 'predict', difficulty: 3, title: 'Text out of JSON',
      query: Q(`
        dataset = microsoft_windows_raw
        | alter logon_type = json_extract_scalar(event_data, "$.LogonType")
        | filter logon_type = 3`),
      prompt: 'What does this return?',
      choices: ['The nine LogonType 3 events', 'An error: `logon_type` is text and cannot be compared with the number 3', 'No rows, because LogonType sits inside a JSON string', 'All 15 events, because filters on JSON values are ignored'],
      answer: 1,
      check: { kind: 'error' },
      explanation: '`json_extract_scalar()` always returns a string; the vendor docs tell you to chain a conversion such as `to_integer()` or `to_float()` when you need a number. Compare with `"3"`, or convert: `to_number(json_extract_scalar(event_data, "$.LogonType")) = 3`.',
      docs: [fn('json_extract_scalar'), fn('to_number')],
    },
    {
      id: 'alter-04', concept: 'alter', type: 'predict', difficulty: 3, title: 'The first non-null value wins',
      query: Q(`
        dataset = xdr_data
        | filter actor_process_image_name = "nmap.exe"
        | alter target = coalesce(dns_query_name, action_external_hostname, action_remote_ip)
        | fields action_remote_ip, target
        | sort asc action_remote_ip`),
      prompt: 'What is `target` on the first row (the probe to 10.10.20.42)?',
      choices: ['null, because `dns_query_name` is null', 'WS-FIN-042', '10.10.20.42', 'WS-FIN-042 and 10.10.20.42 joined together'],
      answer: 1,
      check: { kind: 'cell', row: 0, column: 'target', value: 'WS-FIN-042' },
      explanation: '`coalesce()` evaluates its arguments left to right and returns the first one that is not null. `dns_query_name` is null on the nmap probes and `action_external_hostname` is WS-FIN-042 for 10.10.20.42, so that wins; the other two probes fall through to the IP.',
      docs: [fn('coalesce')],
    },
    {
      id: 'alter-05', concept: 'alter', type: 'bug', difficulty: 3, title: 'Joining an IP and a port',
      prompt: 'This should count external connections per "ip:port". Click the broken line.',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | alter dest = concat(action_remote_ip, ":", action_remote_port)
        | comp count() as conns by dest
        | sort desc conns`),
      bugLine: 2,
      expectError: true,
      fix: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | alter dest = concat(action_remote_ip, ":", to_string(action_remote_port))
        | comp count() as conns by dest
        | sort desc conns`),
      explanation: '`concat()` does not convert types and `action_remote_port` is a number, so the query is rejected. Wrap it: `concat(action_remote_ip, ":", to_string(action_remote_port))`.',
      docs: [fn('concat'), fn('to_string')],
    },
    {
      id: 'alter-06', concept: 'alter', type: 'parsons', difficulty: 3, title: 'Long command lines',
      task: 'Encoded payloads make command lines long. List process starts whose command line is longer than 150 characters, with `_time`, `agent_hostname`, `action_process_image_name` and the length as `cmd_len`, longest first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | alter cmd_len = len(action_process_image_command_line)
        | filter cmd_len > 150
        | fields _time, agent_hostname, action_process_image_name, cmd_len
        | sort desc cmd_len`),
      distractors: ['| fields cmd_len = len(action_process_image_command_line)'],
      explanation: 'alter must run before any stage that uses its output, and it is where per-row values are computed: `fields` takes field names and aliases, never functions. The base64 `-enc` PowerShell (227 characters) and the Word command line that opened Invoice_Q3.docm (158) come back.',
      docs: [st('alter'), fn('len')],
    },
    {
      id: 'alter-07', concept: 'alter', type: 'cloze', difficulty: 3, title: 'URL hosts in command lines',
      task: 'Find download cradles: pull the host out of any http:// or https:// URL in a process command line, keep the rows where one was found, and count commands and hosts per URL host.',
      template: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | alter url_host = ___(action_process_image_command_line, "https?://([^/ ]+)")
        | filter url_host != ___
        | comp count() as cmds, values(agent_hostname) as hosts by url_host`),
      answers: [['regextract'], ['null']],
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | alter url_host = regextract(action_process_image_command_line, "https?://([^/ ]+)")
        | filter url_host != null
        | comp count() as cmds, values(agent_hostname) as hosts by url_host`),
      explanation: '`regextract()` returns the first capture group (here the text between `://` and the next slash or space), or null when the pattern does not match, so `!= null` keeps only the matches. 192.0.2.45 appears in five command lines on four hosts: certutil, the web shell\'s cmd and PowerShell, curl and mshta.',
      docs: [fn('regextract')],
    },
    {
      id: 'alter-08', concept: 'alter', type: 'cloze', difficulty: 4, title: 'Numbers out of JSON',
      task: 'Count network logons (LogonType 3) per user and event id in the Windows logs. `LogonType` comes out of the JSON as text, so convert it before comparing it with the number 3.',
      template: Q(`
        dataset = microsoft_windows_raw
        | filter event_id in (4624, 4625)
        | alter user = ___(event_data, "$.TargetUserName"), logon_type = ___(event_data -> LogonType)
        | filter logon_type = 3
        | comp count() as attempts by user, event_id`),
      answers: [['json_extract_scalar'], ['to_number', 'to_integer', 'to_float']],
      solution: Q(`
        dataset = microsoft_windows_raw
        | filter event_id in (4624, 4625)
        | alter user = json_extract_scalar(event_data, "$.TargetUserName"), logon_type = to_number(event_data -> LogonType)
        | filter logon_type = 3
        | comp count() as attempts by user, event_id`),
      explanation: '`json_extract_scalar(json, "$.key")` and the `json -> key` shorthand both return text, so `to_number()` (or `to_integer()`) is needed before a numeric comparison. administrator has five network failures and one success, all from 192.0.2.45; svc_backup has two failures then a success from SRV-WEB-02.',
      docs: [fn('json_extract_scalar'), fn('to_number')],
    },
    {
      id: 'alter-09', concept: 'alter', type: 'write', difficulty: 4, title: 'Failed logons by source',
      task: 'Brute-force check: for failed logons (`event_id` 4625) in `microsoft_windows_raw`, return the target user as `user`, the source address as `src_ip`, the workstation name as `workstation` (all three from the JSON in `event_data`) and the number of failures as `failures`, most failures first.',
      solution: Q(`
        dataset = microsoft_windows_raw
        | filter event_id = 4625
        | alter user = json_extract_scalar(event_data, "$.TargetUserName"), src_ip = json_extract_scalar(event_data, "$.IpAddress"), workstation = json_extract_scalar(event_data, "$.WorkstationName")
        | comp count() as failures by user, src_ip, workstation
        | sort desc failures`),
      hints: [
        'Stages: `filter` on event_id, `alter` with three `json_extract_scalar()` calls (or `event_data -> Key`), `comp count()` by the three new fields, `sort`.',
        '`dataset = microsoft_windows_raw | filter event_id = 4625 | alter user = json_extract_scalar(event_data, "$.___"), src_ip = ___, workstation = ___ | comp count() as failures by user, src_ip, workstation | sort desc failures`',
        '`... | alter user = json_extract_scalar(event_data, "$.TargetUserName"), src_ip = json_extract_scalar(event_data, "$.IpAddress"), workstation = json_extract_scalar(event_data, "$.WorkstationName") | comp count() as failures by user, src_ip, workstation | sort desc failures`',
      ],
      explanation: 'Five failures for administrator from 192.0.2.45 (workstation KALI), followed by a success at 21:59:41, is a successful brute force against the domain admin, about 15 minutes before the PsExec hop. JSON keys are case-sensitive, so `$.targetusername` would return null.',
      docs: [fn('json_extract_scalar')],
    },
    {
      id: 'alter-10', concept: 'alter', type: 'write', difficulty: 5, title: 'Exfiltration candidates',
      task: 'For network connections that uploaded more than 1 MB (`action_total_upload > 1048576`), return `agent_hostname`, `actor_process_image_name`, `dest` as "ip:port", `upload_mb` (upload divided by 1048576, rounded to a whole number) and `ratio` (upload divided by download, rounded to a whole number), largest upload first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_total_upload > 1048576
        | alter dest = concat(action_remote_ip, ":", to_string(action_remote_port)), upload_mb = round(divide(action_total_upload, 1048576)), ratio = round(divide(action_total_upload, action_total_download))
        | fields agent_hostname, actor_process_image_name, dest, upload_mb, ratio
        | sort desc upload_mb`),
      hints: [
        'Stages: `filter`, one `alter` with `concat()` + `to_string()`, `divide()` (or `/`) and `round()`, then `fields` and `sort`.',
        '`dataset = xdr_data | filter event_type = ENUM.NETWORK and action_total_upload > 1048576 | alter dest = concat(action_remote_ip, ":", ___(action_remote_port)), upload_mb = round(___), ratio = round(___) | fields agent_hostname, actor_process_image_name, dest, upload_mb, ratio | sort desc upload_mb`',
        '`... | alter dest = concat(action_remote_ip, ":", to_string(action_remote_port)), upload_mb = round(divide(action_total_upload, 1048576)), ratio = round(divide(action_total_upload, action_total_download)) | fields agent_hostname, actor_process_image_name, dest, upload_mb, ratio | sort desc upload_mb`',
      ],
      explanation: 'An upload/download ratio far above 1 means the host sent much more than it received, the shape of exfiltration: update.exe pushed 50 MB to 192.0.2.45:4444 (ratio 50) and AnyDesk 8 MB to its relay (ratio 4). concat needs `to_string()` for the port, and `divide()` returns a decimal that `round()` turns into a whole number.',
      docs: [fn('concat'), fn('divide'), fn('round')],
    },

    // ===================================================================================
    // time
    // ===================================================================================
    {
      id: 'time-01', concept: 'time', type: 'concept', difficulty: 2, title: 'Hourly buckets with bin',
      query: Q(`
        config timeframe = 7d
        | dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | bin _time span = 1h
        | comp count() as conns by _time
        | sort asc _time`),
      notes: [
        { line: 0, text: '`config` must be the very first stage. `timeframe = 7d` pins the window to the 7 days before now (the sandbox clock is 2026-10-27 08:00 UTC), whatever the time picker says.' },
        { line: 1, text: 'Data source.' },
        { line: 2, text: 'Connections to the C2 address.' },
        { line: 3, text: '`bin` rounds every `_time` down to the start of its hour and keeps the field name, so rows in the same hour now share one value.' },
        { line: 4, text: 'Group by the binned `_time`: one row per hour that had traffic.' },
        { line: 5, text: 'Chronological order for a timeline or chart.' },
      ],
      prompt: 'After the bin stage, what is the `_time` of the certutil connection made at 2026-10-26 09:14:31?',
      choices: ['2026-10-26 09:14:00 UTC', '2026-10-26 09:00:00 UTC', '2026-10-26 10:00:00 UTC', 'Unchanged; bin adds a separate bucket column'],
      answer: 1,
      explanation: 'bin replaces the value with the start of the interval it falls into (the vendor example: with span=1h, 10:45 becomes 10:00) and the field keeps its name. That is why bin goes before `comp ... by _time`.',
      docs: [st('bin'), st('config')],
    },
    {
      id: 'time-02', concept: 'time', type: 'predict', difficulty: 2, title: 'What 7d really means',
      query: Q(`
        config timeframe = 7d
        | dataset = xdr_data
        | comp count() as events by agent_hostname`),
      prompt: 'The sandbox clock reads 2026-10-27 08:00 UTC and the tenant has 8 hosts. How many rows does this return?',
      choices: ['8', '7', '6', '5'],
      answer: 1,
      check: { kind: 'rowCount', value: 7 },
      explanation: 'A relative timeframe counts back from now, so 7d starts at 2026-10-20 08:00. LNX-BUILD-11\'s only events are its CI job at 06:00-06:05 that morning, two hours too early, so it drops out; with 24h only five hosts remain.',
      docs: [st('config')],
    },
    {
      id: 'time-03', concept: 'time', type: 'predict', difficulty: 3, title: 'Argument order in timestamp_diff',
      query: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | comp min(_time) as first_seen, max(_time) as last_seen by agent_hostname
        | alter dwell_s = timestamp_diff(last_seen, first_seen, "SECOND")
        | sort desc dwell_s
        | limit 1`),
      prompt: 'What is `dwell_s` in the single row returned?',
      choices: ['155', '-155', '2', '0'],
      answer: 0,
      check: { kind: 'cell', row: 0, column: 'dwell_s', value: 155 },
      explanation: '`timestamp_diff(t1, t2, part)` returns t1 minus t2, so putting `last_seen` first gives a positive gap: 09:15:05 - 09:12:30 on WS-FIN-042 is 155 seconds. Swapping the arguments gives -155, and "MINUTE" gives 2 because only whole units count.',
      docs: [fn('timestamp_diff')],
    },
    {
      id: 'time-04', concept: 'time', type: 'mcq', difficulty: 3, title: 'Hour of day, not hourly buckets',
      prompt: 'You want to know whether activity clusters at certain hours of the day across the whole fortnight: one row per hour 0-23. Which approach does that?',
      choices: [
        '`bin _time span = 1h | comp count() as n by _time`',
        '`alter hour = extract_time(_time, "HOUR") | comp count() as n by hour`',
        '`alter hour = date_floor(_time, "h") | comp count() as n by hour`',
        '`alter hour = extract_time(_time, "HOUR") | comp count() as n by _time`',
      ],
      answer: 1,
      explanation: '`bin` and `date_floor()` both round down to the start of the hour but keep the date, so 09:00 on 26 Oct and 09:00 on 27 Oct stay separate rows (20 groups here). `extract_time(_time, "HOUR")` returns only the hour of day (0-23, always GMT per the vendor docs), so grouping by it folds all days into at most 24 rows (13 here); grouping by `_time` instead ignores the new field and counts per exact timestamp.',
      docs: [fn('extract_time'), st('bin'), fn('date_floor')],
    },
    {
      id: 'time-05', concept: 'time', type: 'bug', difficulty: 3, title: 'Counting before bucketing',
      prompt: 'This should count external connections per hour, but 26 Oct 09:00 appears four times with conns = 1. Click the line that is in the wrong place.',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | comp count() as conns by _time
        | bin _time span = 1h
        | sort asc _time`),
      bugLine: 3,
      fix: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | bin _time span = 1h
        | comp count() as conns by _time
        | sort asc _time`),
      explanation: 'comp grouped by the exact second before bin ran, so binning afterwards only relabels rows that were already counted. bin has to come before comp so that rows from the same hour share a `_time` when they are grouped. Nothing errors, which makes this a silent bug.',
      docs: [st('bin')],
    },
    {
      id: 'time-06', concept: 'time', type: 'parsons', difficulty: 3, title: 'Off-hours process starts',
      task: 'List process starts outside business hours (before 07:00 or from 19:00 UTC) with `_time`, `agent_hostname`, `actor_effective_username`, `action_process_image_command_line` and the hour as `hour`, oldest first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | alter hour = extract_time(_time, "HOUR")
        | filter hour < 7 or hour >= 19
        | fields _time, agent_hostname, actor_effective_username, action_process_image_command_line, hour
        | sort asc _time`),
      distractors: ['| alter hour = format_timestamp("%H", _time)'],
      explanation: '`extract_time()` returns a number, so `hour < 7` works; `format_timestamp()` returns text, and comparing it with a number is a type error. Most of the list is routine (the 03:00 backup, the 06:00 CI job) except the 22:15 PsExec session that created and promoted backup_svc on WS-HR-017.',
      docs: [fn('extract_time'), fn('format_timestamp')],
    },
    {
      id: 'time-07', concept: 'time', type: 'cloze', difficulty: 3, title: 'Process starts per day',
      task: 'Chart process starts per day over the last 7 days.',
      template: Q(`
        config timeframe = ___
        | dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | ___ _time span = 1d
        | comp count() as starts by _time
        | sort asc _time`),
      answers: [['7d', '1w', '168h', '7D'], ['bin']],
      solution: Q(`
        config timeframe = 7d
        | dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | bin _time span = 1d
        | comp count() as starts by _time
        | sort asc _time`),
      explanation: '`config timeframe` must be the first stage and the value needs a unit (s, m, h, d, w, mo, y). `bin _time span = 1d` buckets per day before comp counts; 26 Oct stands out with 17 process starts against a handful on other days.',
      docs: [st('config'), st('bin')],
    },
    {
      id: 'time-08', concept: 'time', type: 'cloze', difficulty: 4, title: 'How long since the last C2 contact',
      task: 'For each host that contacted 192.0.2.45, show how many hours ago its last contact was, and the date of that contact as text (YYYY-MM-DD).',
      template: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | comp max(_time) as last_seen by agent_hostname
        | alter hours_ago = ___(current_time(), last_seen, "HOUR"), last_day = ___("%Y-%m-%d", last_seen)
        | sort asc hours_ago`),
      answers: [['timestamp_diff'], ['format_timestamp']],
      solution: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | comp max(_time) as last_seen by agent_hostname
        | alter hours_ago = timestamp_diff(current_time(), last_seen, "HOUR"), last_day = format_timestamp("%Y-%m-%d", last_seen)
        | sort asc hours_ago`),
      explanation: '`timestamp_diff(current_time(), last_seen, "HOUR")` gives the age in whole hours (now minus then), and `format_timestamp(format, timestamp)` turns a timestamp into text, format string first. WS-SALES-023\'s mshta contact is the freshest at 15 hours.',
      docs: [fn('timestamp_diff'), fn('format_timestamp'), fn('current_time')],
    },
    {
      id: 'time-09', concept: 'time', type: 'write', difficulty: 4, title: 'Beaconing per host and hour',
      task: 'Beaconing triage for the last 7 days: count connections to external destinations (`action_country` is not null) per host per hour. Return `_time` (the hour bucket), `agent_hostname` and `conns`, sorted by `conns` descending, then `_time` ascending.',
      solution: Q(`
        config timeframe = 7d
        | dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | bin _time span = 1h
        | comp count() as conns by _time, agent_hostname
        | sort desc conns, asc _time`),
      hints: [
        'Stages: `config timeframe = 7d` first, `filter`, `bin _time span = 1h`, `comp count()` by `_time` and `agent_hostname`, `sort`.',
        '`config timeframe = 7d | dataset = xdr_data | filter event_type = ENUM.NETWORK and action_country != null | bin _time span = ___ | comp count() as conns by ___, agent_hostname | sort desc conns, asc _time`',
        '`config timeframe = 7d | dataset = xdr_data | filter event_type = ENUM.NETWORK and action_country != null | bin _time span = 1h | comp count() as conns by _time, agent_hostname | sort desc conns, asc _time`',
      ],
      explanation: 'WS-FIN-042 made four external connections in the 09:00 hour on 26 Oct (Outlook, then the PowerShell beacon, the certutil download and the port 4444 upload) while every other host-hour has one. The 7d window also drops LNX-BUILD-11\'s 20 Oct download, which is why the config stage matters.',
      docs: [st('bin'), st('config')],
    },
    {
      id: 'time-10', concept: 'time', type: 'write', difficulty: 5, title: 'Off-hours activity summary',
      task: 'Which hosts were active outside business hours (before 07:00 or from 19:00 UTC) in the last 7 days? Count all events, not just process starts. Return `agent_hostname`, `off_hours` (number of events), `first_off` and `last_off` (earliest and latest off-hours event, as text in the form "YYYY-MM-DD HH:MM"), most off-hours events first.',
      solution: Q(`
        config timeframe = 7d
        | dataset = xdr_data
        | alter hour = extract_time(_time, "HOUR")
        | filter hour < 7 or hour >= 19
        | comp count() as off_hours, min(_time) as first_ts, max(_time) as last_ts by agent_hostname
        | alter first_off = format_timestamp("%Y-%m-%d %H:%M", first_ts), last_off = format_timestamp("%Y-%m-%d %H:%M", last_ts)
        | fields agent_hostname, off_hours, first_off, last_off
        | sort desc off_hours`),
      hints: [
        'Stages: `config timeframe = 7d`, `alter` with `extract_time()`, `filter`, `comp` with `count()`, `min(_time)` and `max(_time)` by host, a second `alter` with `format_timestamp()`, `fields`, `sort`.',
        '`config timeframe = 7d | dataset = xdr_data | alter hour = extract_time(_time, "HOUR") | filter hour < 7 or hour >= 19 | comp count() as off_hours, min(_time) as first_ts, max(_time) as last_ts by agent_hostname | alter first_off = format_timestamp(___, first_ts), last_off = ___ | fields agent_hostname, off_hours, first_off, last_off | sort desc off_hours`',
        '`... | alter first_off = format_timestamp("%Y-%m-%d %H:%M", first_ts), last_off = format_timestamp("%Y-%m-%d %H:%M", last_ts) | fields agent_hostname, off_hours, first_off, last_off | sort desc off_hours`',
      ],
      explanation: 'Format after comp, not before: min and max need real timestamps to compare chronologically, and the strings are only for display. SRV-DC-01 (the 03:00 backup and the 22:15 PsExec) and WS-HR-017 (the 22:15-22:16 account creation) stand out; LNX-BUILD-11\'s 06:00 job is outside the 7-day window.',
      docs: [fn('extract_time'), fn('format_timestamp'), st('config')],
    },

    // ===================================================================================
    // dedup
    // ===================================================================================
    {
      id: 'dedup-01', concept: 'dedup', type: 'concept', difficulty: 2, title: 'Keeping the first row per host',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS and action_process_image_name = "cmd.exe"
        | fields _time, agent_hostname, actor_process_image_name, action_process_image_command_line
        | dedup agent_hostname by asc _time
        | sort asc _time`),
      notes: [
        { line: 0, text: 'Endpoint telemetry.' },
        { line: 1, text: 'cmd.exe process starts: four of them on three hosts.' },
        { line: 2, text: 'Trim to the columns you need before dedup; the vendor calls dedup resource-intensive on xdr_data.' },
        { line: 3, text: '`dedup agent_hostname` keeps one row per host and `by asc _time` decides which one: the earliest. Without `by` the surviving row would be arbitrary.' },
        { line: 4, text: 'dedup does not keep any earlier order, so sort after it.' },
      ],
      prompt: 'SRV-WEB-02 started cmd.exe at 11:11:11 and again at 11:13:40. Which row does dedup keep?',
      choices: ['11:11:11, because `by asc _time` keeps the smallest `_time`', '11:13:40, the newest', 'Both, because their command lines differ', 'An arbitrary one of the two'],
      answer: 0,
      explanation: 'With `by asc <field>` dedup keeps, for each duplicate value, the row with the lowest value of that field; `by desc` keeps the highest. Only the dedup fields (here `agent_hostname`) decide what counts as a duplicate, so different command lines do not matter.',
      docs: [st('dedup')],
    },
    {
      id: 'dedup-02', concept: 'dedup', type: 'predict', difficulty: 2, title: 'Distinct destination ports',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | dedup action_remote_port
        | fields action_remote_port`),
      prompt: 'How many rows does this return?',
      choices: ['17', '5', '3', '8'],
      answer: 1,
      check: { kind: 'rowCount', value: 5 },
      explanation: 'dedup keeps one row per distinct value, and the 17 connections use five ports (443, 80, 4444, 445, 3389). When you only need the distinct values with counts, `comp count() as n by action_remote_port` is the cheaper idiom.',
      docs: [st('dedup')],
    },
    {
      id: 'dedup-03', concept: 'dedup', type: 'predict', difficulty: 3, title: 'Which row survives by desc',
      query: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | dedup agent_hostname by desc _time
        | sort asc _time
        | fields agent_hostname, actor_process_image_name`),
      prompt: 'WS-FIN-042 contacted the C2 from powershell.exe, then certutil.exe, then update.exe. Which `actor_process_image_name` is on its row?',
      choices: ['powershell.exe', 'certutil.exe', 'update.exe', 'All three, one row each'],
      answer: 2,
      check: { kind: 'cell', row: 1, column: 'actor_process_image_name', value: 'update.exe' },
      explanation: '`by desc _time` keeps the newest row per host, the 09:15:05 upload from update.exe. dedup itself guarantees no order, which is why the sort comes after it.',
      docs: [st('dedup')],
    },
    {
      id: 'dedup-04', concept: 'dedup', type: 'mcq', difficulty: 3, title: 'Sort first, then dedup?',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | sort desc _time
        | dedup agent_hostname`),
      prompt: 'An analyst wants the latest connection per host and writes this. What is the problem?',
      choices: [
        'None: the sort makes dedup keep the newest row per host',
        'Without a by clause dedup keeps an arbitrary row and ignores the earlier sort; use `dedup agent_hostname by desc _time`, then sort',
        'dedup cannot be used on network events',
        'dedup must come before filter',
      ],
      answer: 1,
      explanation: 'The vendor reference says that without a by clause the record returned is arbitrary among the duplicates, and that dedup does not preserve the sort order of earlier stages. The by clause is the only reliable way to choose the survivor.',
      docs: [st('dedup')],
    },
    {
      id: 'dedup-05', concept: 'dedup', type: 'bug', difficulty: 3, title: 'First or last?',
      prompt: 'This should list the first external destination each host contacted. Click the broken line.',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | fields _time, agent_hostname, action_remote_ip, actor_process_image_name
        | dedup agent_hostname by desc _time
        | sort asc _time`),
      bugLine: 3,
      fix: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | fields _time, agent_hostname, action_remote_ip, actor_process_image_name
        | dedup agent_hostname by asc _time
        | sort asc _time`),
      explanation: '`by desc _time` keeps each host\'s newest row, so WS-FIN-042 would show update.exe at 09:15:05. First-seen needs `by asc _time`, which gives WS-FIN-042\'s chrome.exe visit to www.acme-payroll.com on 22 Oct.',
      docs: [st('dedup')],
    },
    {
      id: 'dedup-06', concept: 'dedup', type: 'parsons', difficulty: 3, title: 'Most recent file per host',
      task: 'For each host, show the most recent file event (`_time`, `agent_hostname`, `actor_process_image_name`, `action_file_path`, `action_file_size`), newest first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.FILE
        | fields _time, agent_hostname, actor_process_image_name, action_file_path, action_file_size
        | dedup agent_hostname by desc _time
        | sort desc _time`),
      distractors: ['| dedup agent_hostname'],
      explanation: 'Filter and trim fields before dedup, pick the survivor with `by desc _time` (a bare `dedup agent_hostname` keeps an arbitrary row), and sort last because dedup does not keep order. The newest file events include /tmp/m.sh created by curl on the Mac and macro_helper.ps1 created by Excel on WS-HR-017.',
      docs: [st('dedup')],
    },
    {
      id: 'dedup-07', concept: 'dedup', type: 'cloze', difficulty: 3, title: 'First sighting of each user on each host',
      task: 'Build a per-host user baseline: the first process start of each user on each host.',
      template: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | fields _time, agent_hostname, actor_effective_username, action_process_image_name
        | dedup agent_hostname, ___ by ___ _time
        | sort asc agent_hostname, asc _time`),
      answers: [['actor_effective_username'], ['asc']],
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | fields _time, agent_hostname, actor_effective_username, action_process_image_name
        | dedup agent_hostname, actor_effective_username by asc _time
        | sort asc agent_hostname, asc _time`),
      explanation: 'With several fields dedup treats the combination as the key, so each (host, user) pair keeps one row, and `by asc _time` makes it the first. SYSTEM on WS-HR-017 first appears at 22:15 on 24 Oct starting PSEXESVC.exe, an unusual first sighting.',
      docs: [st('dedup')],
    },
    {
      id: 'dedup-08', concept: 'dedup', type: 'cloze', difficulty: 4, title: 'Binaries new in the last 24 hours',
      task: 'Find binaries that ran on a host for the first time in the last 24 hours: take the first execution of each image on each host, then keep only those less than 24 hours before now.',
      template: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | fields _time, agent_hostname, action_process_image_name
        | dedup agent_hostname, ___ by asc _time
        | filter timestamp_diff(current_time(), _time, "HOUR") < ___
        | sort asc _time`),
      answers: [['action_process_image_name'], ['24']],
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | fields _time, agent_hostname, action_process_image_name
        | dedup agent_hostname, action_process_image_name by asc _time
        | filter timestamp_diff(current_time(), _time, "HOUR") < 24
        | sort asc _time`),
      explanation: 'Order matters: dedup first finds each image\'s first run per host, and only then does the time filter keep the recent ones. Filtering to 24 hours first would make chrome.exe on WS-FIN-042 (first seen 14 Oct, run again on 27 Oct) look new; done this way, 17 first-time executions remain, the whole WS-FIN-042 chain among them.',
      docs: [st('dedup'), fn('timestamp_diff')],
    },
    {
      id: 'dedup-09', concept: 'dedup', type: 'write', difficulty: 4, title: 'First-seen PsExec per host',
      task: 'Lateral-movement check: for every host where PsExec.exe or its service binary PSEXESVC.exe ran, return the first execution of each: `_time`, `agent_hostname`, `actor_effective_username`, `action_process_image_name` and `action_process_image_command_line`, oldest first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS and action_process_image_name in ("PsExec.exe", "PSEXESVC.exe")
        | fields _time, agent_hostname, actor_effective_username, action_process_image_name, action_process_image_command_line
        | dedup agent_hostname, action_process_image_name by asc _time
        | sort asc _time`),
      hints: [
        'Stages: `filter` with `in (...)`, `fields`, `dedup` on host and image `by asc _time`, `sort`.',
        '`dataset = xdr_data | filter event_type = ENUM.PROCESS and action_process_image_name in (___) | fields _time, agent_hostname, actor_effective_username, action_process_image_name, action_process_image_command_line | dedup agent_hostname, action_process_image_name by ___ _time | sort asc _time`',
        '`... | dedup agent_hostname, action_process_image_name by asc _time | sort asc _time`',
      ],
      explanation: 'PsExec runs on the source (SRV-DC-01, first on 15 Oct against SRV-WEB-02) and installs PSEXESVC.exe on the target (WS-HR-017, 24 Oct 22:15 as SYSTEM), so hunting both names shows each side of a hop. First-seen hides repeats by design: the 24 Oct PsExec run on the DC is not in this result.',
      docs: [st('dedup')],
    },
    {
      id: 'dedup-10', concept: 'dedup', type: 'write', difficulty: 5, title: 'Newest internet destination per host',
      task: 'For each host, return its most recent connection to an address outside 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16: `_time`, `agent_hostname`, `action_remote_ip`, `action_remote_port` and `actor_process_image_name`, newest first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_remote_ip not incidr "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"
        | fields _time, agent_hostname, action_remote_ip, action_remote_port, actor_process_image_name
        | dedup agent_hostname by desc _time
        | sort desc _time`),
      hints: [
        'Stages: `filter` with `not incidr "..."`, `fields`, `dedup agent_hostname by desc _time`, `sort`.',
        '`dataset = xdr_data | filter event_type = ENUM.NETWORK and action_remote_ip ___ "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16" | fields _time, agent_hostname, action_remote_ip, action_remote_port, actor_process_image_name | dedup agent_hostname by ___ _time | sort desc _time`',
        '`... and action_remote_ip not incidr "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16" | fields ... | dedup agent_hostname by desc _time | sort desc _time`',
      ],
      explanation: '`not incidr` with all three RFC1918 ranges is a direct test for internet destinations (action_country happens to work in this tenant, but it is an enrichment, not a guarantee). For four of the six hosts the latest internet contact is 192.0.2.45, each from a different process.',
      docs: [st('dedup'), fn('incidr')],
    },

    // ===================================================================================
    // join-union
    // ===================================================================================
    {
      id: 'join-union-01', concept: 'join-union', type: 'concept', difficulty: 2, title: 'Enriching with a lookup',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | join type = inner (dataset = hva_hosts | fields hostname, tier) as hva hva.hostname = agent_hostname
        | comp count() as starts by agent_hostname, tier
        | sort desc starts`),
      notes: [
        { line: 0, text: 'Endpoint telemetry (the left side of the join).' },
        { line: 1, text: 'Process starts only.' },
        { line: 2, text: 'The sub-query in parentheses reads the lookup and keeps only the columns needed; `as hva` names it and `hva.hostname = agent_hostname` is the join condition. type = inner (also the default) keeps only rows that matched.' },
        { line: 3, text: 'Group by host and by `tier`, which came from the lookup.' },
        { line: 4, text: 'join does not preserve order, so sorting comes after it.' },
      ],
      prompt: 'WS-HR-017 started nine processes but is not in the output. Why?',
      choices: ['It is not in hva_hosts, and an inner join drops rows with no match', 'The lookup stores hostnames in lowercase', 'comp drops groups with fewer than ten rows', 'join keeps only the first matching row per host'],
      answer: 0,
      explanation: 'An inner join returns only the rows where the condition matched on both sides. hva_hosts lists SRV-DC-01, SRV-WEB-02, WS-FIN-042 and LAPTOP-SEC-09, so the other hosts disappear; `type = left` would keep them with a null tier.',
      docs: [st('join')],
    },
    {
      id: 'join-union-02', concept: 'join-union', type: 'predict', difficulty: 2, title: 'union appends rows',
      query: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | fields _time, agent_hostname
        | union (dataset = panw_ngfw_traffic_raw | filter dest_ip = "192.0.2.45" | fields _time, source_ip)`),
      prompt: 'How many rows does this return?',
      choices: ['6', '13', '19', '42'],
      answer: 1,
      check: { kind: 'rowCount', value: 13 },
      explanation: 'union appends the sub-query\'s rows to the current ones: 6 endpoint connections plus 7 firewall sessions (six on the on-prem firewall and one through Prisma Access). It neither de-duplicates nor matches anything, and columns are merged by name, so `agent_hostname` is null on the firewall rows and `source_ip` is null on the endpoint rows.',
      docs: [st('union')],
    },
    {
      id: 'join-union-03', concept: 'join-union', type: 'predict', difficulty: 3, title: 'Left join, then null',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | comp count() as starts by agent_hostname
        | join type = left (dataset = hva_hosts | fields hostname, tier) as hva hva.hostname = agent_hostname
        | filter tier = null`),
      prompt: 'How many rows does this return?',
      choices: ['0, because a left join never creates nulls', '4', '8', 'An error: `tier` exists only on matched rows'],
      answer: 1,
      check: { kind: 'rowCount', value: 4 },
      explanation: 'A left join keeps every left row and fills the right-side columns with null where nothing matched. Filtering `tier = null` turns it into an anti-join: the four hosts that are not high-value assets (WS-HR-017, WS-SALES-023, MAC-DESIGN-03, LNX-BUILD-11).',
      docs: [st('join')],
    },
    {
      id: 'join-union-04', concept: 'join-union', type: 'predict', difficulty: 3, title: 'Who wins a name conflict?',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | alter department = "unassigned"
        | join type = inner (dataset = user_directory | fields username, department) as u u.username = actor_effective_username
        | comp count() as starts by department`),
      prompt: 'Both sides now have a `department` field. Which department values appear in the result?',
      choices: ['Only "unassigned"', 'Only directory departments such as Finance and Human Resources', 'Both: "unassigned" on some rows and directory values on others', 'An error, because the field name exists twice'],
      answer: 1,
      check: { kind: 'values', column: 'department', value: ['Human Resources', 'Finance', 'IT', 'Engineering', 'Security', 'Sales', 'Design'] },
      explanation: 'When both sides have a field with the same name, `conflict_strategy` defaults to right, so the lookup\'s department overwrites yours on every joined row; the inner join has already dropped the SYSTEM and IIS rows that had no directory entry. Add `conflict_strategy = left` to keep the left value, or `both` to keep both columns.',
      docs: [st('join')],
    },
    {
      id: 'join-union-05', concept: 'join-union', type: 'bug', difficulty: 3, title: 'The wrong column in the sub-query',
      prompt: 'This should return process starts whose image hash is a known IOC, but it returns nothing. Click the broken line.',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | filter action_process_image_sha256 in (dataset = ioc_hashes | fields threat_name)
        | fields _time, agent_hostname, action_process_image_path, action_process_image_sha256`),
      bugLine: 2,
      fix: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | filter action_process_image_sha256 in (dataset = ioc_hashes | fields sha256)
        | fields _time, agent_hostname, action_process_image_path, action_process_image_sha256`),
      explanation: '`in (sub-query)` compares against the values of the sub-query\'s single column. `fields threat_name` returns names such as Trojan.Downloader.Rhombus, which never equal a SHA256; return `sha256` and the update.exe start on WS-FIN-042 appears.',
      docs: [st('filter')],
    },
    {
      id: 'join-union-06', concept: 'join-union', type: 'parsons', difficulty: 3, title: 'One timeline from two sources',
      task: 'Build one timeline of every contact with 192.0.2.45 as seen by the endpoint agent and by the firewall, with the columns `_time`, `source` and `port`, oldest first.',
      solution: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | fields _time, agent_hostname as source, action_remote_port as port
        | union (dataset = panw_ngfw_traffic_raw | filter dest_ip = "192.0.2.45" | fields _time, source_ip as source, dest_port as port)
        | sort asc _time`),
      distractors: ['| union (dataset = panw_ngfw_traffic_raw | filter dest_ip = "192.0.2.45" | fields _time, source_ip, dest_port)'],
      explanation: 'union appends the firewall rows to the endpoint rows, and renaming both sides to `source` and `port` lines the columns up because union merges by name. union does not keep order, so the sort goes last: each endpoint connection is followed about a second later by the firewall session log.',
      docs: [st('union'), st('fields')],
    },
    {
      id: 'join-union-07', concept: 'join-union', type: 'cloze', difficulty: 3, title: 'IOC matching with a sub-query',
      task: 'Which file events wrote a file whose SHA256 is in the `ioc_hashes` lookup?',
      template: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.FILE
        | filter action_file_sha256 ___ (dataset = ioc_hashes | fields ___)
        | fields _time, agent_hostname, event_sub_type, action_file_path`),
      answers: [['in'], ['sha256']],
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.FILE
        | filter action_file_sha256 in (dataset = ioc_hashes | fields sha256)
        | fields _time, agent_hostname, event_sub_type, action_file_path`),
      explanation: 'A sub-query inside `in (...)` supplies a list of values to match, which is all you need when the lookup only has to answer "is it known bad?". The two update.exe file events on WS-FIN-042 match; use join when you also want lookup columns such as threat_name.',
      docs: [st('filter')],
    },
    {
      id: 'join-union-08', concept: 'join-union', type: 'cloze', difficulty: 4, title: 'Accounts missing from the directory',
      task: 'Which accounts start processes but have no entry in `user_directory`? Count process starts per such account.',
      template: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | join type = ___ (dataset = user_directory | fields username, department, is_admin) as u u.username = actor_effective_username
        | filter is_admin = ___
        | comp count() as starts by actor_effective_username
        | sort desc starts`),
      answers: [['left'], ['null']],
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | join type = left (dataset = user_directory | fields username, department, is_admin) as u u.username = actor_effective_username
        | filter is_admin = null
        | comp count() as starts by actor_effective_username
        | sort desc starts`),
      explanation: 'A left join keeps rows with no directory match and fills the lookup columns with null, so `is_admin = null` isolates them; an inner join would have dropped them silently. NT AUTHORITY\\SYSTEM (5 starts, including PSEXESVC and the net user commands) and the IIS app pool (4, the web shell) are exactly where the attacker activity hid.',
      docs: [st('join')],
    },
    {
      id: 'join-union-09', concept: 'join-union', type: 'write', difficulty: 4, title: 'IOC hits in process and file events',
      task: 'Which hashes from `ioc_hashes` appear in the telemetry? Check both process starts (`action_process_image_sha256`) and file events (`action_file_sha256`). Return `_time`, `agent_hostname`, `event_sub_type`, `file_hash` (the hash that matched) and `threat_name`, oldest first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type in (ENUM.PROCESS, ENUM.FILE)
        | alter file_hash = coalesce(action_process_image_sha256, action_file_sha256)
        | join type = inner (dataset = ioc_hashes | fields sha256, threat_name) as ioc ioc.sha256 = file_hash
        | fields _time, agent_hostname, event_sub_type, file_hash, threat_name
        | sort asc _time`),
      hints: [
        'Stages: `filter` (process and file events), `alter` with `coalesce()` to get one hash column, `join` to `ioc_hashes` for threat_name, `fields`, `sort`.',
        '`dataset = xdr_data | filter event_type in (ENUM.PROCESS, ENUM.FILE) | alter file_hash = coalesce(action_process_image_sha256, ___) | join type = inner (dataset = ioc_hashes | fields sha256, threat_name) as ioc ioc.___ = file_hash | fields _time, agent_hostname, event_sub_type, file_hash, threat_name | sort asc _time`',
        '`... | alter file_hash = coalesce(action_process_image_sha256, action_file_sha256) | join type = inner (dataset = ioc_hashes | fields sha256, threat_name) as ioc ioc.sha256 = file_hash | fields _time, agent_hostname, event_sub_type, file_hash, threat_name | sort asc _time`',
      ],
      explanation: 'The hash lives in a different field per event type, so `coalesce()` folds them into one column before the join. The result tells the dropper\'s story: created and written by certutil at 09:14:35-36 and executed 26 seconds later, with the threat_name that an `in (...)` sub-query could not supply.',
      docs: [st('join'), fn('coalesce')],
    },
    {
      id: 'join-union-10', concept: 'join-union', type: 'write', difficulty: 5, title: 'Privileged users on high-value assets',
      task: 'Which privileged accounts (`is_admin = true` in `user_directory`) started processes on high-value assets (`hva_hosts`)? Return `agent_hostname`, `tier`, `actor_effective_username`, `title`, `starts` (number of process starts) and `processes` (distinct image names), sorted by `tier` ascending.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.PROCESS
        | join type = inner (dataset = user_directory | filter is_admin = true | fields username, title) as u u.username = actor_effective_username
        | join type = inner (dataset = hva_hosts | fields hostname, tier) as h h.hostname = agent_hostname
        | comp count() as starts, values(action_process_image_name) as processes by agent_hostname, tier, actor_effective_username, title
        | sort asc tier`),
      hints: [
        'Stages: `filter`, two inner `join`s (user_directory filtered to admins, then hva_hosts), `comp count(), values()` by host, tier, user and title, `sort`.',
        '`dataset = xdr_data | filter event_type = ENUM.PROCESS | join type = inner (dataset = user_directory | filter ___ | fields username, title) as u u.username = actor_effective_username | join type = inner (dataset = hva_hosts | fields hostname, tier) as h h.hostname = ___ | comp count() as starts, values(action_process_image_name) as processes by agent_hostname, tier, actor_effective_username, title | sort asc tier`',
        '`... | join type = inner (dataset = user_directory | filter is_admin = true | fields username, title) as u u.username = actor_effective_username | join type = inner (dataset = hva_hosts | fields hostname, tier) as h h.hostname = agent_hostname | comp ... | sort asc tier`',
      ],
      explanation: 'Each inner join narrows and enriches: the first keeps admin accounts and adds their title, the second keeps high-value hosts and adds the tier. The domain admin running PsExec on the tier-0 DC is the hop to investigate; d.schrute\'s nmap on the security laptop is the known analyst.',
      docs: [st('join')],
    },

    // ===================================================================================
    // advanced
    // ===================================================================================
    {
      id: 'advanced-01', concept: 'advanced', type: 'concept', difficulty: 2, title: 'Where is the traffic going?',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | filter action_remote_ip not incidr "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"
        | iploc action_remote_ip loc_country as country, loc_city as city
        | comp count() as conns, sum(action_total_upload) as upload_bytes by action_remote_ip, country, city
        | sort desc upload_bytes`),
      notes: [
        { line: 0, text: 'Endpoint telemetry.' },
        { line: 1, text: 'Network connections only.' },
        { line: 2, text: '`not incidr` drops every address in the private RFC1918 ranges; the ranges are one comma-separated string and the test matches if any range contains the IP. There is also a function form, `incidr(ip, "ranges")`.' },
        { line: 3, text: '`iploc` adds GeoIP columns for an IPv4 field; here just country and city, renamed with `as`.' },
        { line: 4, text: 'One row per destination with its location.' },
        { line: 5, text: 'Biggest uploads first.' },
      ],
      prompt: 'What does the iploc stage do to the rows?',
      choices: ['Adds GeoIP columns (here country and city) for the IPv4 in `action_remote_ip`', 'Drops rows whose IP has no GeoIP match', 'Replaces the IP with its DNS name', 'Nothing until a view stage draws a map'],
      answer: 0,
      explanation: 'iploc enriches each row with location fields (a default set such as loc_country, loc_city and loc_latlon when you name none) and leaves the row count unchanged; addresses without a match just get nulls. Filter before iploc so it looks up only the addresses you care about, as the vendor optimization note says.',
      docs: [st('iploc'), fn('incidr')],
    },
    {
      id: 'advanced-02', concept: 'advanced', type: 'predict', difficulty: 2, title: 'Most common parents with top',
      query: Q(`
        preset = xdr_process
        | top 3 actor_process_image_name`),
      prompt: 'What is `TOP_COUNT` in the first row?',
      choices: ['39', '12', '30.77', '3'],
      answer: 1,
      check: { kind: 'cell', row: 0, column: 'TOP_COUNT', value: 12 },
      explanation: '`preset = xdr_process` returns only process events (39 rows). `top` counts each value of the field and returns the most frequent with TOP_COUNT and TOP_PERCENT: explorer.exe is the parent of 12 of the 39 starts (30.77%). In Cortex top is approximate on large data; the sandbox counts exactly.',
      docs: [st('top'), st('presets', 'preset stage')],
    },
    {
      id: 'advanced-03', concept: 'advanced', type: 'predict', difficulty: 3, title: 'Giving nulls a name',
      query: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | replacenull action_country = "internal"
        | comp count() as conns by action_country
        | sort desc conns`),
      prompt: 'What are the `conns` values, top to bottom?',
      choices: ['7, 6, 4', '7, 6', '7, 6, 0', '17'],
      answer: 0,
      check: { kind: 'values', column: 'conns', value: [7, 6, 4], ordered: true },
      explanation: 'replacenull swaps the null `action_country` of the four internal connections for the label "internal", so they form a named group (DE 7, US 6, internal 4). The replacement must match the field type: a quoted string here, a number for numeric fields, `arraycreate()` for arrays.',
      docs: [st('replacenull')],
    },
    {
      id: 'advanced-04', concept: 'advanced', type: 'mcq', difficulty: 3, title: 'Reading a transaction stage',
      query: Q(`
        dataset = xdr_data
        | filter agent_hostname = "WS-FIN-042"
        | transaction agent_hostname span = 30m`),
      queryMayFail: true,
      prompt: 'The sandbox does not run transaction. In Cortex, what does each output row of this query represent?',
      choices: [
        'One event, with a `_duration` column added',
        'One group of related WS-FIN-042 events lasting at most 30 minutes, with `_start_time`, `_end_time`, `_duration` (seconds) and `_num_of_rows`',
        'One fixed 30-minute clock bucket, like `bin _time span = 30m`',
        'One row per host for the whole timeframe',
      ],
      answer: 1,
      explanation: 'transaction groups events that share the transaction fields into sequences, and span sets the maximum length of each one. The original fields are aggregated into JSON string arrays (at most 50 fields) and the stage adds _start_time, _end_time, _duration, _num_of_rows and _transaction_id; filter hard first, because it is resource-intensive.',
      docs: [st('transaction')],
    },
    {
      id: 'advanced-05', concept: 'advanced', type: 'bug', difficulty: 3, title: 'Saving results as a lookup',
      prompt: 'This should save the hosts that contacted the C2 as a lookup for later queries. Click the broken line.',
      query: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | comp count() as conns, sum(action_total_upload) as upload_bytes by agent_hostname
        | target type = lookup c2_contacted_hosts
        | sort desc upload_bytes`),
      bugLine: 3,
      expectError: true,
      fix: Q(`
        dataset = xdr_data
        | filter action_remote_ip = "192.0.2.45"
        | comp count() as conns, sum(action_total_upload) as upload_bytes by agent_hostname
        | sort desc upload_bytes
        | target type = lookup c2_contacted_hosts`),
      explanation: 'target must be the final stage of the query: nothing may follow it. Move the sort above it; later queries can then read the lookup with `dataset = c2_contacted_hosts`, and `append = true` adds to an existing lookup instead of overwriting it.',
      docs: [st('target')],
    },
    {
      id: 'advanced-06', concept: 'advanced', type: 'parsons', difficulty: 4, title: 'One host, one IP, many ports',
      task: 'A host talking to the same IP on several ports is a C2 tell. Find the (host, remote IP) pairs that used more than one destination port, then expand the port array so each port gets its own row, sorted by port.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | comp values(action_remote_port) as ports, count() as conns by agent_hostname, action_remote_ip
        | filter array_length(ports) > 1
        | arrayexpand ports
        | sort asc ports`),
      distractors: ['| arrayexpand action_remote_port'],
      explanation: '`values()` builds an array of distinct ports per (host, IP) pair, `array_length()` filters on its size, and arrayexpand turns the array back into one row per element, copying the other columns, in no particular order (hence the sort after it). Only WS-FIN-042 to 192.0.2.45 qualifies: 80 for the certutil download, 443 for the PowerShell beacon and 4444 for the upload.',
      docs: [st('arrayexpand'), fn('array_length'), fn('values')],
    },
    {
      id: 'advanced-07', concept: 'advanced', type: 'cloze', difficulty: 4, title: 'Numbering rows per host',
      task: 'Show the first two processes started on each host, numbered in time order, without collapsing the rows the way comp would.',
      template: Q(`
        preset = xdr_process
        | windowcomp ___() by ___ sort asc _time as seq
        | filter seq <= 2
        | fields agent_hostname, seq, _time, action_process_image_name
        | sort asc agent_hostname, asc seq`),
      answers: [['row_number'], ['agent_hostname']],
      solution: Q(`
        preset = xdr_process
        | windowcomp row_number() by agent_hostname sort asc _time as seq
        | filter seq <= 2
        | fields agent_hostname, seq, _time, action_process_image_name
        | sort asc agent_hostname, asc seq`),
      explanation: '`windowcomp row_number() by agent_hostname sort asc _time` numbers the rows 1, 2, 3 ... within each host and, unlike comp, keeps every row. The by clause sets the partition, and the sort clause is mandatory for ranking functions such as row_number.',
      docs: [st('windowcomp')],
    },
    {
      id: 'advanced-08', concept: 'advanced', type: 'cloze', difficulty: 4, title: 'Internal versus external share',
      task: 'Label every connection internal or external with an RFC1918 range check, then show how the connections split between the two labels, with counts and percentages.',
      template: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | alter direction = if(___(action_remote_ip, "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"), "internal", "external")
        | ___ 2 direction`),
      answers: [['incidr'], ['top']],
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK
        | alter direction = if(incidr(action_remote_ip, "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"), "internal", "external")
        | top 2 direction`),
      explanation: '`incidr(ip, "ranges")` returns true or false, so it can drive `if()` inside alter as well as a filter. `top 2 direction` returns each label with TOP_COUNT and TOP_PERCENT: 13 external (76.47%) and 4 internal (23.53%). Append `view graph type = pie xaxis = direction yaxis = TOP_COUNT` to draw the split as a pie chart in the console.',
      docs: [fn('incidr'), st('top')],
    },
    {
      id: 'advanced-09', concept: 'advanced', type: 'write', difficulty: 4, title: 'Running upload total per host',
      task: 'Track cumulative upload per host: for external network events (`action_country` is not null), return `_time`, `agent_hostname`, `action_remote_ip`, `action_total_upload` and `running_upload` (the running total of `action_total_upload` per host in time order). Sort by `agent_hostname`, then `_time`, both ascending.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_country != null
        | windowcomp sum(action_total_upload) by agent_hostname sort asc _time as running_upload
        | fields _time, agent_hostname, action_remote_ip, action_total_upload, running_upload
        | sort asc agent_hostname, asc _time`),
      hints: [
        'Stages: `filter`, `windowcomp sum(...) by agent_hostname sort asc _time as running_upload`, `fields`, `sort`.',
        '`dataset = xdr_data | filter event_type = ENUM.NETWORK and action_country != null | windowcomp ___(action_total_upload) by ___ sort asc _time as running_upload | fields _time, agent_hostname, action_remote_ip, action_total_upload, running_upload | sort asc agent_hostname, asc _time`',
        '`... | windowcomp sum(action_total_upload) by agent_hostname sort asc _time as running_upload | fields _time, agent_hostname, action_remote_ip, action_total_upload, running_upload | sort asc agent_hostname, asc _time`',
      ],
      explanation: 'With a sort clause and no between clause, windowcomp uses the frame from the start of the partition to the current row, so `sum()` becomes a running total that restarts for each host. WS-FIN-042 jumps from 371,841 bytes to 52,800,641 in one step: the 09:15:05 upload is where the exfiltration happens. A windowcomp stage computes one function, so a second window column (a per-host `row_number()`, say) needs a second windowcomp stage.',
      docs: [st('windowcomp')],
    },
    {
      id: 'advanced-10', concept: 'advanced', type: 'write', difficulty: 5, title: 'Direct-to-IP internet connections',
      task: 'Connections to the internet with no DNS lookup are a classic C2 tell. For network events whose `action_remote_ip` is not in 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16, fill a null `dns_query_name` with "direct-ip", add GeoIP `country` and `city` with iploc, and return per destination: `action_remote_ip`, `dns_query_name`, `country`, `city`, `conns`, `hosts` (distinct hosts) and `upload_bytes` (total upload), largest upload first.',
      solution: Q(`
        dataset = xdr_data
        | filter event_type = ENUM.NETWORK and action_remote_ip not incidr "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"
        | replacenull dns_query_name = "direct-ip"
        | iploc action_remote_ip loc_country as country, loc_city as city
        | comp count() as conns, count_distinct(agent_hostname) as hosts, sum(action_total_upload) as upload_bytes by action_remote_ip, dns_query_name, country, city
        | sort desc upload_bytes`),
      hints: [
        'Stages: `filter` with `not incidr`, `replacenull dns_query_name = "direct-ip"`, `iploc action_remote_ip loc_country as country, loc_city as city`, `comp` by IP, DNS name, country and city, `sort`.',
        '`dataset = xdr_data | filter event_type = ENUM.NETWORK and action_remote_ip not incidr "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16" | replacenull ___ = "direct-ip" | iploc action_remote_ip loc_country as ___, loc_city as ___ | comp count() as conns, count_distinct(agent_hostname) as hosts, sum(action_total_upload) as upload_bytes by action_remote_ip, dns_query_name, country, city | sort desc upload_bytes`',
        '`... | replacenull dns_query_name = "direct-ip" | iploc action_remote_ip loc_country as country, loc_city as city | comp count() as conns, count_distinct(agent_hostname) as hosts, sum(action_total_upload) as upload_bytes by action_remote_ip, dns_query_name, country, city | sort desc upload_bytes`',
      ],
      explanation: 'Every other destination, even the AnyDesk relay and pastebin.com, was reached through a DNS name, while 192.0.2.45 (Frankfurt) was contacted by bare IP from four hosts and received 52.7 MB: direct-to-IP plus volume is a strong C2 signal. Running replacenull before comp turns the empty DNS names into a readable group value.',
      docs: [st('replacenull'), st('iploc'), fn('incidr')],
    },
  ]);
})(typeof globalThis !== 'undefined' ? globalThis : this);
