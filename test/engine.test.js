// Engine unit tests: run with `node test/engine.test.js`
const { loadEngine } = require('./load');
const XQL = loadEngine();

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; failures.push({ name, error: e }); }
}
function eq(a, b, msg) { const sa = JSON.stringify(a), sb = JSON.stringify(b); if (sa !== sb) throw new Error(`${msg || 'not equal'}: got ${sa}, expected ${sb}`); }
function run(q) { return XQL.run(q); }
function rows(q) { return run(q).rows; }
function cols(q) { return run(q).columns; }
function throwsWith(q, re) {
  let err = null;
  try { run(q); } catch (e) { err = e; }
  if (!err) throw new Error(`expected an error matching ${re} for: ${q}`);
  if (!re.test(err.message)) throw new Error(`error message "${err.message}" does not match ${re}`);
  return err;
}

const N = XQL.DATASETS.xdr_data.rows.length;

test('dataset loads all rows', () => eq(rows('dataset = xdr_data').length, N));
test('dataset name is case-insensitive', () => eq(rows('dataset = XDR_DATA').length, N));
test('implicit dataset defaults to xdr_data with a warning', () => { const r = run('filter event_type = 1'); eq(r.warnings.length > 0, true); eq(r.rows.length, rows('dataset = xdr_data | filter event_type = 1').length); });
test('comments are ignored', () => eq(rows('dataset = xdr_data // all\n| filter event_type = 1 /* process */').length, rows('dataset = xdr_data | filter event_type = 1').length));
test('filter with enum and integer agree', () => eq(rows('dataset = xdr_data | filter event_type = ENUM.PROCESS').length, rows('dataset = xdr_data | filter event_type = 1').length));
test('bare enum name works', () => eq(rows('dataset = xdr_data | filter event_type = PROCESS').length, rows('dataset = xdr_data | filter event_type = 1').length));
test('event_sub_type enum compares as string', () => eq(rows('dataset = xdr_data | filter event_sub_type = ENUM.FILE_WRITE').length, rows('dataset = xdr_data | filter event_sub_type = "FILE_WRITE"').length));
test('string compare is case-insensitive by default', () => eq(rows('dataset = xdr_data | filter action_process_image_name = "POWERSHELL.EXE"').length, rows('dataset = xdr_data | filter action_process_image_name = "powershell.exe"').length));
test('config case_sensitive = true makes it strict', () => eq(rows('config case_sensitive = true | dataset = xdr_data | filter action_process_image_name = "POWERSHELL.EXE"').length, 0));
test('wildcard in equals', () => eq(rows('dataset = xdr_data | filter action_process_image_command_line = "*whoami*"').length, rows('dataset = xdr_data | filter action_process_image_command_line contains "whoami"').length));
test('in list with wildcards', () => eq(rows('dataset = xdr_data | filter action_process_image_name in ("powershell.exe", "pwsh.exe")').length, rows('dataset = xdr_data | filter action_process_image_name = "powershell.exe"').length));
test('not in', () => eq(rows('dataset = xdr_data | filter event_type = 1 and action_process_image_name not in ("chrome.exe")').length, rows('dataset = xdr_data | filter event_type = 1').length - rows('dataset = xdr_data | filter action_process_image_name = "chrome.exe"').length));
test('regex ~= is a partial match', () => eq(rows('dataset = xdr_data | filter action_process_image_command_line ~= "whoami"').length, rows('dataset = xdr_data | filter action_process_image_command_line contains "whoami"').length));
test('regex (?i) flag', () => eq(rows('dataset = xdr_data | filter action_process_image_name ~= "(?i)^WINWORD"').length, rows('dataset = xdr_data | filter action_process_image_name = "WINWORD.EXE"').length));
test('!~= negates', () => eq(rows('dataset = xdr_data | filter event_type = 1 and action_process_image_command_line !~= "whoami"').length, rows('dataset = xdr_data | filter event_type = 1').length - rows('dataset = xdr_data | filter action_process_image_command_line ~= "whoami"').length));
test('null comparisons', () => { eq(rows('dataset = xdr_data | filter dns_query_name != null').length, rows('dataset = xdr_data | filter dns_query_name != null and dns_query_name != ""').length); eq(rows('dataset = xdr_data | filter dns_query_name = null').length + rows('dataset = xdr_data | filter dns_query_name != null').length, N); });
test('comparison with null field is false', () => eq(rows('dataset = xdr_data | filter action_remote_port = 443').length, rows('dataset = xdr_data | filter event_type = 2 and action_remote_port = 443').length));
test('incidr operator', () => eq(rows('dataset = xdr_data | filter action_remote_ip not incidr "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16" and action_remote_ip != null').length, rows('dataset = xdr_data | filter action_country != null').length));
test('incidr function', () => eq(rows('dataset = xdr_data | filter incidr(action_remote_ip, "10.10.20.0/24")').length, rows('dataset = xdr_data | filter action_remote_ip = "10.10.20.*"').length));
test('type mismatch string vs number errors with a hint', () => throwsWith('dataset = xdr_data | filter action_remote_port = "443"', /Type mismatch.*holds numbers/));
test('unknown field suggests a correction', () => throwsWith('dataset = xdr_data | filter agent_hostnme = "x"', /Did you mean 'agent_hostname'/));
test('unknown stage suggests a correction', () => throwsWith('dataset = xdr_data | filtr event_type = 1', /Did you mean 'filter'/));
test('sort direction after field is explained', () => throwsWith('dataset = xdr_data | sort _time desc', /direction comes before the field/));
test('fields selects and aliases', () => eq(cols('dataset = xdr_data | fields agent_hostname as host, event_type'), ['host', 'event_type']));
test('fields wildcard', () => eq(cols('dataset = xdr_data | fields action_file_*').length, 5));
test('fields exclusion', () => eq(cols('dataset = xdr_data | fields agent_hostname, event_type, dfe_labels | fields - event_type'), ['agent_hostname', 'dfe_labels']));
test('alias must be used later', () => throwsWith('dataset = xdr_data | fields agent_hostname as host | filter agent_hostname = "x"', /no longer available/));
test('_time survives fields for later sorting', () => { const r = run('dataset = xdr_data | fields agent_hostname | sort desc _time | limit 1'); eq(r.rows.length, 1); });
test('alter creates fields usable later', () => eq(rows('dataset = xdr_data | alter proc = lowercase(action_process_image_name) | filter proc = "winword.exe"').length, rows('dataset = xdr_data | filter action_process_image_name = "WINWORD.EXE"').length));
test('alter with concat and to_string', () => { const r = rows('dataset = xdr_data | filter event_type = 2 | alter dst = concat(action_remote_ip, ":", to_string(action_remote_port)) | fields dst | limit 1'); eq(/^\d+\.\d+\.\d+\.\d+:\d+$/.test(r[0].dst), true); });
test('concat without to_string errors', () => throwsWith('dataset = xdr_data | alter x = concat(agent_hostname, action_remote_port)', /concat\(\) only accepts strings/));
test('comp count by host', () => { const r = run('dataset = xdr_data | comp count() as n by agent_hostname'); eq(r.columns, ['agent_hostname', 'n']); eq(r.rows.reduce((a, x) => a + x.n, 0), N); });
test('comp count_distinct and min/max', () => { const r = rows('dataset = xdr_data | filter action_process_image_name = "powershell.exe" | comp count_distinct(agent_hostname) as hosts, min(_time) as first_seen'); eq(r[0].hosts, 4); eq(r[0].first_seen instanceof XQL.XTime, true); });
test('comp drops other fields with a clear error', () => throwsWith('dataset = xdr_data | comp count() as n by agent_hostname | filter event_type = 1', /dropped by the comp stage/));
test('comp values returns distinct array', () => { const r = rows('dataset = xdr_data | filter event_type = 2 | comp values(action_country) as countries'); eq(r[0].countries.slice().sort(), ['DE', 'US']); });
test('comp default alias', () => eq(cols('dataset = xdr_data | comp count(agent_hostname) by event_type'), ['event_type', 'count_agent_hostname']));
test('scalar function in comp errors helpfully', () => throwsWith('dataset = xdr_data | comp lowercase(agent_hostname) by event_type', /not an aggregation/));
test('aggregate outside comp errors helpfully', () => throwsWith('dataset = xdr_data | alter n = count()', /aggregation function/));
test('sort desc with limit', () => { const r = rows('dataset = xdr_data | filter event_type = 2 | sort desc action_total_upload | limit 1'); eq(r[0].action_total_upload, 52428800); });
test('sort multi-key', () => { const r = rows('dataset = xdr_data | filter event_type = 2 | sort asc agent_hostname, desc action_remote_port | fields agent_hostname, action_remote_port | limit 2'); eq(r[0].agent_hostname, 'LAPTOP-SEC-09'); eq(r[0].action_remote_port, 3389); });
test('dedup keeps one per value', () => eq(rows('dataset = xdr_data | dedup agent_hostname').length, 8));
test('dedup by asc _time keeps earliest', () => { const r = rows('dataset = xdr_data | filter action_process_image_name = "PsExec.exe" | dedup agent_hostname by asc _time'); eq(r.length, 1); eq(r[0]._time.toString(), '2026-10-15 18:45:00 UTC'); });
test('dedup by desc _time keeps latest', () => { const r = rows('dataset = xdr_data | filter action_process_image_name = "PsExec.exe" | dedup agent_hostname by desc _time'); eq(r[0]._time.toString(), '2026-10-24 22:15:00 UTC'); });
test('bin by hour then comp', () => { const r = rows('dataset = xdr_data | filter agent_hostname = "WS-FIN-042" and _time >= "2026-10-26 09:00:00" and _time < "2026-10-26 10:00:00" | bin _time span = 1h | comp count() as n by _time'); eq(r.length, 1); eq(r[0]._time.toString(), '2026-10-26 09:00:00 UTC'); });
test('bin numeric span', () => { const r = rows('dataset = xdr_data | filter event_type = 2 | bin action_remote_port span = 1000 | comp count() as n by action_remote_port | sort asc action_remote_port'); eq(r[0].action_remote_port, 0); });
test('bin needs a unit for timestamps', () => throwsWith('dataset = xdr_data | bin _time span = 1', /needs a time unit/));
test('config timeframe filters by _time', () => { eq(rows('config timeframe = 24h | dataset = xdr_data').length, rows('dataset = xdr_data | filter _time >= "2026-10-26 08:00:00"').length); eq(rows('config timeframe = 7d | dataset = xdr_data').length < N, true); });
test('config timeframe between', () => eq(rows('config timeframe between "2026-10-23 00:00:00" and "2026-10-23 23:59:59" | dataset = xdr_data').length, rows('dataset = xdr_data | filter agent_hostname = "SRV-WEB-02"').length));
test('config must be first', () => throwsWith('dataset = xdr_data | config timeframe = 1d', /must be the very first stage/));
test('join inner with lookup', () => { const r = run('dataset = xdr_data | filter event_type = 1 | fields agent_hostname, action_process_image_name | join type = inner (dataset = hva_hosts | fields hostname, owner, tier) as hva hva.hostname = agent_hostname | comp count() as n by owner'); eq(r.rows.length, 4); });
test('join left keeps unmatched rows', () => { const a = rows('dataset = xdr_data | fields agent_hostname | dedup agent_hostname | join type = left (dataset = hva_hosts) as h h.hostname = agent_hostname'); eq(a.length, 8); eq(a.filter((x) => x.owner == null).length, 4); });
test('join default is inner', () => eq(rows('dataset = xdr_data | fields agent_hostname | dedup agent_hostname | join (dataset = hva_hosts) as h h.hostname = agent_hostname').length, 4));
test('join unknown right field suggests', () => throwsWith('dataset = xdr_data | join (dataset = hva_hosts) as h h.host = agent_hostname', /does not exist in the joined sub-query 'h'/));
test('filter in sub-query', () => eq(rows('dataset = xdr_data | filter action_process_image_sha256 in (dataset = ioc_hashes | fields sha256)').length, 1));
test('union with sub-query', () => { const a = rows('dataset = xdr_data | filter agent_hostname = "MAC-DESIGN-03"').length; const b = rows('dataset = xdr_data | filter agent_hostname = "LNX-BUILD-11"').length; eq(rows('dataset = xdr_data | filter agent_hostname = "MAC-DESIGN-03" | union (dataset = xdr_data | filter agent_hostname = "LNX-BUILD-11")').length, a + b); });
test('union with dataset name', () => eq(rows('dataset = hva_hosts | union ioc_hashes').length, 7));
test('replacenull', () => eq(rows('dataset = xdr_data | filter event_type = 2 | replacenull action_country = "internal" | filter action_country = "internal"').length, rows('dataset = xdr_data | filter event_type = 2 and action_country = null').length));
test('arrayexpand', () => { const r = rows('dataset = xdr_data | filter event_type = 2 | comp values(action_remote_port) as ports by agent_hostname | arrayexpand ports | filter agent_hostname = "LAPTOP-SEC-09"'); eq(r.length, 2); });
test('top', () => { const r = run('dataset = xdr_data | filter event_type = 1 | top 2 action_process_image_name'); eq(r.columns, ['action_process_image_name', 'TOP_COUNT', 'TOP_PERCENT']); eq(r.rows.length, 2); eq(r.rows[0].TOP_COUNT >= r.rows[1].TOP_COUNT, true); });
test('json_extract_scalar on windows logs', () => { const r = rows('dataset = microsoft_windows_raw | filter event_id = 4625 | alter user = json_extract_scalar(event_data, "$.TargetUserName"), src = event_data -> IpAddress | comp count() as fails by user, src | sort desc fails'); eq(r[0].user, 'administrator'); eq(r[0].src, '185.220.101.45'); eq(r[0].fails, 5); });
test('to_number and comparison', () => eq(rows('dataset = microsoft_windows_raw | filter to_number(json_extract_scalar(event_data, "$.LogonType")) = 3').length, 9));
test('split and arrayindex (single-quoted strings are literal, so "\\" is one backslash)', () => { const r = rows('dataset = xdr_data | filter actor_effective_username contains "\\" | alter user = arrayindex(split(actor_effective_username, "\\"), 1) | fields user | limit 1'); eq(typeof r[0].user, 'string'); eq(r[0].user.includes('\\'), false); });
test('alias rename error names the new field', () => throwsWith('dataset = xdr_data | fields agent_hostname as host | filter agent_hostname = "x"', /renamed to 'host'/));
test('regextract', () => { const r = rows('dataset = xdr_data | filter action_process_image_name = "certutil.exe" and event_type = 1 | alter url = regextract(action_process_image_command_line, "(http://[^ ]+)") | fields url'); eq(r[0].url, 'http://185.220.101.45/update.exe'); });
test('if and coalesce', () => { const r = rows('dataset = xdr_data | filter event_type = 2 | alter dir = if(action_country = null, "internal", "external"), host = coalesce(action_external_hostname, action_remote_ip) | comp count() as n by dir'); eq(r.length, 2); });
test('timestamp_diff and extract_time', () => { const r = rows('dataset = xdr_data | filter agent_hostname = "WS-FIN-042" | comp min(_time) as a, max(_time) as b | alter days = timestamp_diff(b, a, "DAY"), hour = extract_time(a, "HOUR")'); eq(r[0].days, 12); eq(r[0].hour, 10); });
test('format_timestamp', () => { const r = rows('dataset = xdr_data | sort asc _time | limit 1 | alter d = format_timestamp("%Y-%m-%d", _time) | fields d'); eq(r[0].d, '2026-10-13'); });
test('date_floor', () => { const r = rows('dataset = xdr_data | sort desc _time | limit 1 | alter d = date_floor(_time, "d") | fields d'); eq(r[0].d.toString(), '2026-10-27 00:00:00 UTC'); });
test('windowcomp row_number per partition', () => { const r = rows('dataset = xdr_data | filter event_type = 1 | windowcomp row_number() by agent_hostname sort asc _time as seq | filter seq = 1'); eq(r.length, 8); });
test('windowcomp running sum', () => { const r = rows('dataset = xdr_data | filter agent_hostname = "WS-FIN-042" and event_type = 2 | windowcomp sum(action_total_upload) by agent_hostname sort asc _time as running | sort desc _time | limit 1'); eq(r[0].running, 48213 + 307200 + 1228 + 52428800 + 15200); });
test('iploc enrichment', () => { const r = rows('dataset = xdr_data | filter action_remote_ip = "185.220.101.45" | iploc action_remote_ip loc_country as c | dedup c'); eq(r[0].c, 'DE'); });
test('tag adds _tag', () => { const r = run('dataset = xdr_data | limit 1 | tag add "reviewed"'); eq(r.rows[0]._tag, ['reviewed']); });
test('target must be last', () => throwsWith('dataset = xdr_data | target type = lookup x | limit 1', /must be the last stage/));
test('view is accepted', () => { const r = run('dataset = xdr_data | comp count() as n by agent_hostname | view graph type = pie xaxis = agent_hostname yaxis = n'); eq(r.view.mode, 'graph'); });
test('preset xdr_process', () => eq(rows('preset = xdr_process').length, rows('dataset = xdr_data | filter event_type = 1').length));
test('unsupported stage gives a clear error', () => throwsWith('dataset = xdr_data | transaction agent_hostname span = 1h', /not executed by the tutor sandbox/));
test('trace records every stage', () => { const r = run('dataset = xdr_data | filter event_type = 1 | fields agent_hostname | limit 3'); eq(r.trace.map((t) => t.kind), ['dataset', 'filter', 'fields', 'limit']); eq(r.trace[3].rowsOut, 3); });
test('compareResults unordered match', () => { const a = run('dataset = xdr_data | comp count() as n by agent_hostname'); const b = run('dataset = xdr_data | comp count() as n by agent_hostname | sort desc n'); eq(XQL.compareResults(a, b, { ordered: false }).ok, true); });
test('compareResults ordered mismatch explains order', () => { const a = run('dataset = xdr_data | comp count() as n by agent_hostname | sort desc n'); const b = run('dataset = xdr_data | comp count() as n by agent_hostname | sort asc n'); eq(XQL.compareResults(a, b, { ordered: true }).kind, 'order'); });
test('compareResults column mismatch', () => { const a = run('dataset = xdr_data | fields agent_hostname'); const b = run('dataset = xdr_data | fields agent_hostname, event_type'); eq(XQL.compareResults(a, b).kind, 'columns'); });
test('single quotes give a helpful error', () => throwsWith("dataset = xdr_data | filter agent_hostname = 'x'", /double quotes/));
test('dangling pipe error', () => throwsWith('dataset = xdr_data |', /dangling/));
test('== gives a helpful error', () => throwsWith('dataset = xdr_data | filter event_type == 1', /single '='/));
test('functions not allowed in fields', () => throwsWith('dataset = xdr_data | fields lowercase(agent_hostname)', /not allowed in the fields stage/));
test('triple quoted strings process escapes', () => eq(rows('dataset = xdr_data | filter action_process_image_command_line contains """\\\\SRV-WEB-02"""').length, 1));
test('not in drops null values like != does', () => eq(rows('dataset = xdr_data | filter action_country not in ("US")').length, rows('dataset = xdr_data | filter action_country != "US"').length));
test('not in keeps nulls only when null is listed', () => eq(rows('dataset = xdr_data | filter action_country not in ("US", null)').length, rows('dataset = xdr_data | filter action_country != null and action_country != "US"').length));
test('sort without a direction sorts ascending with a warning', () => { const r = run('dataset = xdr_data | sort _time | limit 2'); eq(r.warnings.some((w) => /no direction/.test(w)), true); eq(Number(r.rows[0]._time) <= Number(r.rows[1]._time), true); });
test('contains with a list gets a helpful error', () => throwsWith('dataset = xdr_data | filter agent_hostname contains ("WS", "SRV")', /contains takes a single value/));
test('misspelled sub-type enum suggests the right one', () => throwsWith('dataset = xdr_data | filter event_sub_type = ENUM.FILE_WRTIE', /Did you mean ENUM.FILE_WRITE/));
test('quoted enum name gets an ENUM hint', () => throwsWith('dataset = xdr_data | filter event_type = "FILE"', /ENUM\.FILE/));
test('not of a null comparison drops the row', () => eq(rows('dataset = xdr_data | filter not action_country = "US"').length, rows('dataset = xdr_data | filter action_country != "US"').length));
test('not incidr() drops rows with no IP', () => eq(rows('dataset = xdr_data | filter not incidr(action_remote_ip, "10.0.0.0/8")').length, rows('dataset = xdr_data | filter action_remote_ip not incidr "10.0.0.0/8"').length));
test('join after sort loses the order and warns', () => { const r = run('dataset = xdr_data | filter event_type = 1 | fields _time, agent_hostname | sort desc _time | join type = left (dataset = hva_hosts) as h h.hostname = agent_hostname'); eq(r.warnings.some((w) => /does not preserve the order/.test(w)), true); const ts = r.rows.map((x) => Number(x._time)); eq(ts.every((v, i) => i === 0 || ts[i - 1] >= v), false); });
test('sort after join restores order without a warning', () => { const r = run('dataset = xdr_data | filter event_type = 1 | fields _time, agent_hostname | join type = left (dataset = hva_hosts) as h h.hostname = agent_hostname | sort desc _time'); eq(r.warnings.length, 0); const ts = r.rows.map((x) => Number(x._time)); eq(ts.every((v, i) => i === 0 || ts[i - 1] >= v), true); });
test('scramble is deterministic', () => { const a = run('dataset = xdr_data | dedup agent_hostname').rows.map((r) => r.agent_hostname); const b = run('dataset = xdr_data | dedup agent_hostname').rows.map((r) => r.agent_hostname); eq(a, b); });
test('round takes one argument and divide accepts numeric strings', () => { const r = rows('dataset = xdr_data | limit 1 | alter x = round(2.5), y = divide("10", 4) | fields x, y')[0]; eq([r.x, r.y], [3, 2.5]); throwsWith('dataset = xdr_data | alter x = round(2.5, 1)', /expects 1 argument/); });
test('grader ignores system fields', () => { const a = run('dataset = xdr_data | filter event_type = 3 | fields agent_hostname'); const b = run('dataset = xdr_data | filter event_type = 3 | fields _time, agent_hostname'); eq(XQL.compareResults(a, b).ok, true); });

console.log(`engine tests: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f.name}\n     ${f.error.message}`);
if (failed) process.exitCode = 1;
