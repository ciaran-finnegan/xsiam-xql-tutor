// XQL Tutor - value helpers, scalar functions and aggregate functions
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const { XQLError } = XQL;

  // ---- timestamps -------------------------------------------------------
  class XTime {
    constructor(ms) { this.ms = ms; }
    valueOf() { return this.ms; }
    toString() { return XQL.formatTime(this.ms); }
    toJSON() { return this.toString(); }
  }
  XQL.XTime = XTime;
  XQL.isTime = (v) => v instanceof XTime;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  XQL.formatTime = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  };
  XQL.parseTimeString = (s) => {
    const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?\s*(UTC|Z)?$/i);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  };
  const DURATION_MS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, mo: 30 * 86400000, y: 365 * 86400000 };
  XQL.durationMs = (value, unit) => {
    const u = DURATION_MS[String(unit).toLowerCase()];
    if (!u) throw new XQLError(`Unknown time unit '${unit}'. Use s, m, h, d, w, mo or y`);
    return value * u;
  };

  // ---- generic value helpers -------------------------------------------
  XQL.typeOf = (v) => v == null ? 'null' : v instanceof XTime ? 'timestamp' : Array.isArray(v) ? 'array'
    : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : typeof v === 'object' ? 'json' : 'string';

  function globToRegex(pat, cs) {
    const esc = pat.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + esc + '$', cs ? 's' : 'is');
  }
  XQL.strEq = (a, b, cs) => (cs ? a === b : a.toLowerCase() === b.toLowerCase());
  XQL.patternMatch = (value, pattern, cs) => (pattern.includes('*') ? globToRegex(pattern, cs).test(value) : XQL.strEq(value, pattern, cs));
  XQL.toRegex = (pat) => {
    let flags = 's', p = pat;
    if (p.startsWith('(?i)')) { flags += 'i'; p = p.slice(4); }
    try { return new RegExp(p, flags); } catch (e) { throw new XQLError(`Invalid regular expression "${pat}": ${e.message}`); }
  };

  XQL.equals = (a, b, cs) => {
    if (a == null || b == null) return a == null && b == null;
    if (a instanceof XTime || b instanceof XTime) return Number(a) === Number(b);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => XQL.equals(x, b[i], cs));
    if (typeof a === 'string' && typeof b === 'string') return XQL.strEq(a, b, cs);
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
  };
  XQL.compare = (a, b) => {
    // null sorts as the smallest value (ascending puts nulls first), like BigQuery
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (a instanceof XTime || b instanceof XTime) return Number(a) - Number(b);
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    const sa = typeof a === 'string' ? a : JSON.stringify(a), sb = typeof b === 'string' ? b : JSON.stringify(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  };
  XQL.display = (v) => {
    if (v == null) return 'null';
    if (v instanceof XTime) return v.toString();
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return JSON.stringify(v);
  };

  // ---- IP helpers -------------------------------------------------------
  function ipToInt(ip) {
    const m = String(ip).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const parts = m.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  }
  XQL.ipToInt = ipToInt;
  XQL.inCidr = (ip, cidrs) => {
    const n = ipToInt(ip);
    if (n == null) return false;
    return String(cidrs).split(',').map((s) => s.trim()).filter(Boolean).some((c) => {
      const [base, bitsStr] = c.split('/');
      const b = ipToInt(base);
      const bits = bitsStr == null ? 32 : Number(bitsStr);
      if (b == null || !(bits >= 0 && bits <= 32)) throw new XQLError(`Invalid CIDR range "${c}"`);
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return ((n & mask) >>> 0) === ((b & mask) >>> 0);
    });
  };
  XQL.isPrivateIPv4 = (ip) => XQL.inCidr(ip, '10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8');

  // ---- JSON path --------------------------------------------------------
  function jsonValue(input, fname) {
    if (input == null) return null;
    if (typeof input === 'object') return input;
    try { return JSON.parse(input); } catch (e) { return undefined; }
  }
  function jsonPath(obj, path) {
    if (obj === undefined) return undefined;
    let p = String(path).trim();
    if (p.startsWith('$')) p = p.slice(1);
    const parts = [];
    const re = /\.?([A-Za-z0-9_\-]+)|\[\s*'([^']*)'\s*\]|\[\s*"([^"]*)"\s*\]|\[\s*(\d+)\s*\]/g;
    let m;
    while ((m = re.exec(p))) parts.push(m[1] ?? m[2] ?? m[3] ?? Number(m[4]));
    let cur = obj;
    for (const k of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[k];
    }
    return cur;
  }
  XQL.jsonPath = jsonPath;

  // ---- scalar functions -------------------------------------------------
  const F = (XQL.functions = {});
  const def = (name, min, max, fn, doc) => { F[name] = { name, min, max, fn, doc }; };
  const want = (v, type, fname) => {
    if (v == null) return null;
    const t = XQL.typeOf(v);
    if (type === 'number' && t === 'timestamp') return v.ms;
    if (type === 'timestamp' && t === 'number') return new XTime(v);
    if (t !== type) throw new XQLError(`${fname}() expects a ${type} but got ${t}${type === 'string' ? '. Wrap numbers or booleans with to_string()' : ''}`);
    return v;
  };

  def('lowercase', 1, 1, ([s]) => { s = want(s, 'string', 'lowercase'); return s == null ? null : s.toLowerCase(); }, 'lowercase(string)');
  def('uppercase', 1, 1, ([s]) => { s = want(s, 'string', 'uppercase'); return s == null ? null : s.toUpperCase(); }, 'uppercase(string)');
  def('len', 1, 1, ([s]) => { s = want(s, 'string', 'len'); return s == null ? null : s.length; }, 'len(string)');
  const trimChars = (s, chars, where) => {
    const set = chars == null ? ' \t' : chars;
    let a = 0, b = s.length;
    if (where !== 'r') while (a < b && set.includes(s[a])) a++;
    if (where !== 'l') while (b > a && set.includes(s[b - 1])) b--;
    return s.slice(a, b);
  };
  def('trim', 1, 2, ([s, c]) => { s = want(s, 'string', 'trim'); return s == null ? null : trimChars(s, c, 'lr'); }, 'trim(string [, chars])');
  def('ltrim', 1, 2, ([s, c]) => { s = want(s, 'string', 'ltrim'); return s == null ? null : trimChars(s, c, 'l'); }, 'ltrim(string [, chars])');
  def('rtrim', 1, 2, ([s, c]) => { s = want(s, 'string', 'rtrim'); return s == null ? null : trimChars(s, c, 'r'); }, 'rtrim(string [, chars])');
  def('concat', 2, 99, (args) => {
    for (const a of args) { if (a == null) return null; if (typeof a !== 'string') throw new XQLError(`concat() only accepts strings; got ${XQL.typeOf(a)}. Use to_string() first.`); }
    return args.join('');
  }, 'concat(string1, string2, ...)');
  def('to_string', 1, 1, ([v]) => v == null ? null : v instanceof XTime ? v.toString() : typeof v === 'object' ? JSON.stringify(v) : String(v), 'to_string(value)');
  def('to_number', 1, 1, ([v]) => { if (v == null) return null; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; const n = Number(String(v).trim()); return String(v).trim() === '' || Number.isNaN(n) ? null : n; }, 'to_number(string)');
  F.to_float = Object.assign({}, F.to_number, { name: 'to_float' });
  def('to_integer', 1, 1, ([v]) => { if (v == null) return null; if (typeof v === 'number') return Math.round(v); if (typeof v === 'boolean') return v ? 1 : 0; const s = String(v).trim(); if (!/^-?\d+$/.test(s)) return null; return Number(s); }, 'to_integer(string)');
  def('to_boolean', 1, 1, ([v]) => { if (v == null) return null; if (typeof v === 'boolean') return v; const s = String(v).trim().toLowerCase(); return s === 'true' ? true : s === 'false' ? false : null; }, 'to_boolean(string)');
  def('to_json_string', 1, 1, ([v]) => v == null ? null : typeof v === 'string' ? v : JSON.stringify(v), 'to_json_string(value)');
  def('split', 1, 2, ([s, d]) => { if (s == null) return []; s = want(s, 'string', 'split'); const delim = d == null || d === '' ? ' ' : String(d); return s.split(delim); }, 'split(string [, delimiter])');
  def('arrayindex', 2, 2, ([a, i]) => { a = want(a, 'array', 'arrayindex'); if (a == null) return null; i = want(i, 'number', 'arrayindex'); const idx = i < 0 ? a.length + i : i; return idx >= 0 && idx < a.length ? a[idx] : null; }, 'arrayindex(array, index)');
  def('array_length', 1, 1, ([a]) => { a = want(a, 'array', 'array_length'); return a == null ? 0 : a.length; }, 'array_length(array)');
  def('arraystring', 2, 2, ([a, d]) => { a = want(a, 'array', 'arraystring'); if (a == null) return null; return a.map((x) => XQL.display(x)).join(String(d)); }, 'arraystring(array, delimiter)');
  def('arraycreate', 0, 99, (args) => args.slice(), 'arraycreate(v1, v2, ...)');
  def('arraydistinct', 1, 1, ([a]) => { a = want(a, 'array', 'arraydistinct'); if (a == null) return null; const out = []; for (const x of a) if (!out.some((y) => XQL.equals(x, y, true))) out.push(x); return out; }, 'arraydistinct(array)');
  def('arrayconcat', 2, 99, (args) => args.flatMap((a) => (a == null ? [] : want(a, 'array', 'arrayconcat'))), 'arrayconcat(array1, array2, ...)');
  def('arrayindexof', 2, 2, ([a, v]) => { a = want(a, 'array', 'arrayindexof'); if (a == null) return null; const i = a.findIndex((x) => XQL.equals(x, v, true)); return i; }, 'arrayindexof(array, value)');
  def('regextract', 2, 2, ([s, re]) => { s = want(s, 'string', 'regextract'); if (s == null) return null; const m = XQL.toRegex(String(re)).exec(s); if (!m) return null; return m[1] !== undefined ? m[1] : m[0]; }, 'regextract(string, "regex with (capture group)")');
  def('replace', 3, 3, ([s, o, n]) => { s = want(s, 'string', 'replace'); if (s == null) return null; return String(o) === '' ? s : s.split(String(o)).join(String(n)); }, 'replace(string, "old", "new")');
  def('replex', 3, 3, ([s, re, n]) => { s = want(s, 'string', 'replex'); if (s == null) return null; const r = XQL.toRegex(String(re)); return s.replace(new RegExp(r.source, r.flags + 'g'), String(n)); }, 'replex(string, "regex", "replacement")');
  def('string_count', 2, 2, ([s, p], ctx) => { s = want(s, 'string', 'string_count'); if (s == null) return null; const pat = String(p); if (!pat) return 0; const hay = ctx.caseSensitive ? s : s.toLowerCase(); const needle = ctx.caseSensitive ? pat : pat.toLowerCase(); return hay.split(needle).length - 1; }, 'string_count(string, "substring")');
  def('if', 2, 3, ([c, a, b]) => (c === true ? a : b === undefined ? null : b), 'if(condition, value_if_true [, value_if_false])');
  def('coalesce', 1, 99, (args) => { for (const a of args) if (a != null) return a; return null; }, 'coalesce(v1, v2, ...)');
  def('json_extract_scalar', 2, 2, ([s, p]) => { const v = jsonPath(jsonValue(s), p); if (v == null || typeof v === 'object') return null; return typeof v === 'string' ? v : String(v); }, 'json_extract_scalar(json_string, "$.path")');
  def('json_extract', 2, 2, ([s, p]) => { const v = jsonPath(jsonValue(s), p); return v === undefined ? null : JSON.stringify(v); }, 'json_extract(json_string, "$.path")');
  def('json_extract_array', 2, 2, ([s, p]) => { const v = jsonPath(jsonValue(s), p); return Array.isArray(v) ? v : null; }, 'json_extract_array(json_string, "$.path")');
  def('json_extract_scalar_array', 2, 2, ([s, p]) => { const v = jsonPath(jsonValue(s), p); return Array.isArray(v) ? v.map((x) => (x == null || typeof x === 'object' ? null : String(x))) : null; }, 'json_extract_scalar_array(json_string, "$.path")');

  const PART_MS = { day: 86400000, hour: 3600000, minute: 60000, second: 1000, millisecond: 1, microsecond: 0.001 };
  def('timestamp_diff', 3, 3, ([a, b, part]) => { a = want(a, 'timestamp', 'timestamp_diff'); b = want(b, 'timestamp', 'timestamp_diff'); if (a == null || b == null) return null; const u = PART_MS[String(part).toLowerCase()]; if (!u) throw new XQLError('timestamp_diff part must be DAY, HOUR, MINUTE, SECOND, MILLISECOND or MICROSECOND'); return Math.trunc((a.ms - b.ms) / u); }, 'timestamp_diff(ts1, ts2, "SECOND")');
  def('extract_time', 2, 2, ([t, part]) => {
    t = want(t, 'timestamp', 'extract_time'); if (t == null) return null;
    const d = new Date(t.ms); const p = String(part).toLowerCase();
    const map = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), millisecond: d.getUTCMilliseconds(), dayofweek: ((d.getUTCDay() + 6) % 7) + 1, dayofyear: Math.floor((t.ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1, quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
    if (!(p in map)) throw new XQLError('extract_time part must be one of YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, DAYOFWEEK, DAYOFYEAR, QUARTER');
    return map[p];
  }, 'extract_time(timestamp, "HOUR")');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function tzOffsetMs(tz) {
    if (tz == null) return 0;
    const m = String(tz).match(/^([+-])(\d{2}):(\d{2})$/);
    if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600000 + Number(m[3]) * 60000);
    if (/^utc$/i.test(tz)) return 0;
    throw new XQLError(`The tutor sandbox supports time zones as offsets such as "+02:00" (got "${tz}")`);
  }
  XQL.formatTimestamp = (fmt, ms, tz) => {
    const d = new Date(ms + tzOffsetMs(tz));
    return String(fmt).replace(/%([YmdHMSyjbBaAeIp%])/g, (_, c) => {
      switch (c) {
        case 'Y': return d.getUTCFullYear(); case 'y': return pad(d.getUTCFullYear() % 100); case 'm': return pad(d.getUTCMonth() + 1);
        case 'd': return pad(d.getUTCDate()); case 'e': return String(d.getUTCDate()); case 'H': return pad(d.getUTCHours());
        case 'I': return pad(((d.getUTCHours() + 11) % 12) + 1); case 'p': return d.getUTCHours() < 12 ? 'AM' : 'PM';
        case 'M': return pad(d.getUTCMinutes()); case 'S': return pad(d.getUTCSeconds()); case 'b': return MONTHS[d.getUTCMonth()];
        case 'B': return new Date(ms).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }); case 'a': return DAYS[d.getUTCDay()];
        case 'A': return new Date(ms).toLocaleString('en-US', { weekday: 'long', timeZone: 'UTC' }); case 'j': return pad(Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1, 3);
        case '%': return '%'; default: return c;
      }
    });
  };
  def('format_timestamp', 2, 3, ([fmt, t, tz]) => { t = want(t, 'timestamp', 'format_timestamp'); if (t == null) return null; return XQL.formatTimestamp(String(fmt), t.ms, tz); }, 'format_timestamp("%Y-%m-%d %H:%M:%S", timestamp [, "+02:00"])');
  def('parse_timestamp', 2, 3, ([fmt, s, tz]) => {
    if (s == null) return null;
    const f = String(fmt); const str = String(s);
    const order = []; let re = '^';
    for (let i = 0; i < f.length; i++) {
      if (f[i] === '%') { const c = f[++i]; const spec = { Y: '(\\d{4})', m: '(\\d{1,2})', d: '(\\d{1,2})', H: '(\\d{1,2})', M: '(\\d{1,2})', S: '(\\d{1,2})', b: '([A-Za-z]{3})' }[c]; if (!spec) throw new XQLError(`parse_timestamp: unsupported format %${c} in the sandbox`); re += spec; order.push(c); }
      else re += f[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    const m = new RegExp(re + '$').exec(str.trim());
    if (!m) return null;
    const v = { Y: 1970, m: 1, d: 1, H: 0, M: 0, S: 0 };
    order.forEach((c, i) => { v[c] = c === 'b' ? MONTHS.findIndex((x) => x.toLowerCase() === m[i + 1].toLowerCase()) + 1 : Number(m[i + 1]); });
    const month = order.includes('b') ? v.b : v.m;
    return new XTime(Date.UTC(v.Y, month - 1, v.d, v.H, v.M, v.S) - tzOffsetMs(tz));
  }, 'parse_timestamp("%Y-%m-%d %H:%M:%S", string)');
  def('date_floor', 2, 3, ([t, unit, tz]) => {
    t = want(t, 'timestamp', 'date_floor'); if (t == null) return null;
    const off = tzOffsetMs(tz); const d = new Date(t.ms + off); const u = String(unit).toLowerCase();
    let ms;
    if (u === 'y') ms = Date.UTC(d.getUTCFullYear(), 0, 1);
    else if (u === 'mo') ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    else if (u === 'w') { const day = (d.getUTCDay() + 6) % 7; ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); }
    else if (u === 'd') ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    else if (u === 'h') ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
    else throw new XQLError('date_floor unit must be y, mo, w, d or h');
    return new XTime(ms - off);
  }, 'date_floor(timestamp, "d")');
  def('current_time', 0, 0, (_, ctx) => new XTime(ctx.now), 'current_time()');
  def('to_epoch', 1, 2, ([t, unit]) => { t = want(t, 'timestamp', 'to_epoch'); if (t == null) return null; const u = String(unit || 'SECONDS').toUpperCase(); return u === 'MILLIS' ? t.ms : u === 'MICROS' ? t.ms * 1000 : Math.floor(t.ms / 1000); }, 'to_epoch(timestamp, "SECONDS")');
  def('to_timestamp', 1, 2, ([n, unit]) => { if (n == null) return null; if (n instanceof XTime) return n; if (typeof n === 'string') { const ms = XQL.parseTimeString(n); if (ms == null) throw new XQLError(`to_timestamp could not parse "${n}"`); return new XTime(ms); } n = want(n, 'number', 'to_timestamp'); const u = String(unit || 'SECONDS').toUpperCase(); return new XTime(u === 'MILLIS' ? n : u === 'MICROS' ? n / 1000 : n * 1000); }, 'to_timestamp(number, "SECONDS")');
  def('timestamp_seconds', 1, 1, ([n]) => { n = want(n, 'number', 'timestamp_seconds'); return n == null ? null : new XTime(n * 1000); }, 'timestamp_seconds(epoch_seconds)');
  def('parse_epoch', 1, 2, ([n, unit]) => F.to_timestamp.fn([n, unit]), 'parse_epoch(number, "SECONDS")');
  // null IPs give null (not false), so `not incidr(...)` does not keep rows that have no IP at all
  def('incidr', 2, 2, ([ip, c]) => (ip == null ? null : XQL.inCidr(String(ip), String(c))), 'incidr(ip_field, "10.0.0.0/8, 192.168.0.0/16")');
  def('incidrlist', 2, 2, ([ip, c]) => (ip == null ? null : XQL.inCidr(String(ip), Array.isArray(c) ? c.join(',') : String(c))), 'incidrlist(ip_field, array_of_cidrs)');
  def('is_ipv4', 1, 1, ([ip]) => ip != null && ipToInt(String(ip)) != null, 'is_ipv4(string)');
  def('is_known_private_ipv4', 1, 1, ([ip]) => (ip == null ? null : XQL.isPrivateIPv4(String(ip))), 'is_known_private_ipv4(string)');
  def('wildcard_match', 2, 2, ([s, p]) => { s = want(s, 'string', 'wildcard_match'); if (s == null) return false; let pat = String(p); let cs = true; if (pat.startsWith('(?i)')) { cs = false; pat = pat.slice(4); } const esc = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'); return new RegExp('^' + esc + '$', cs ? 's' : 'is').test(s); }, 'wildcard_match(string, "pat*ern?")');
  def('round', 1, 1, ([n]) => { n = want(n, 'number', 'round'); if (n == null) return null; return Math.round(n); }, 'round(number)');
  def('floor', 1, 1, ([n]) => { n = want(n, 'number', 'floor'); return n == null ? null : Math.floor(n); }, 'floor(number)');
  def('ceil', 1, 1, ([n]) => { n = want(n, 'number', 'ceil'); return n == null ? null : Math.ceil(n); }, 'ceil(number)');
  def('abs', 1, 1, ([n]) => { n = want(n, 'number', 'abs'); return n == null ? null : Math.abs(n); }, 'abs(number)');
  def('sqrt', 1, 1, ([n]) => { n = want(n, 'number', 'sqrt'); return n == null ? null : Math.sqrt(n); }, 'sqrt(number)');
  // the arithmetic functions accept numbers stored as strings (per the vendor reference); the + - * / operators do not
  const numArg = (v, name) => { if (typeof v === 'string') { const n = Number(v.trim()); if (v.trim() === '' || Number.isNaN(n)) throw new XQLError(`${name}() expects a number but got the text "${v}"`); return n; } return want(v, 'number', name); };
  const arith = (name, f) => def(name, 2, 2, ([a, b]) => { a = numArg(a, name); b = numArg(b, name); if (a == null || b == null) return null; return f(a, b); }, `${name}(a, b)`);
  arith('add', (a, b) => a + b); arith('subtract', (a, b) => a - b); arith('multiply', (a, b) => a * b);
  arith('divide', (a, b) => (b === 0 ? null : a / b)); arith('safe_divide', (a, b) => (b === 0 ? null : a / b));
  arith('pow', (a, b) => Math.pow(a, b)); arith('mod', (a, b) => (b === 0 ? null : a % b));
  def('greatest', 1, 99, (args) => (args.some((a) => a == null) ? null : args.reduce((m, v) => (XQL.compare(v, m) > 0 ? v : m))), 'greatest(a, b, ...)');
  def('least', 1, 99, (args) => (args.some((a) => a == null) ? null : args.reduce((m, v) => (XQL.compare(v, m) < 0 ? v : m))), 'least(a, b, ...)');
  def('format_string', 1, 99, ([fmt, ...rest]) => { let i = 0; return String(fmt).replace(/%[sd]/g, () => XQL.display(rest[i++])); }, 'format_string("%s - %s", a, b)');
  def('extract_url_host', 1, 1, ([u]) => { u = want(u, 'string', 'extract_url_host'); if (u == null) return null; const m = u.match(/^(?:[a-z]+:\/\/)?([^/:?#]+)/i); return m ? m[1] : null; }, 'extract_url_host(url)');

  // ---- aggregate functions (comp / windowcomp) ---------------------------
  // Each receives (values, rows, ctx). rows are the group's rows in chronological order (by _time).
  const A = (XQL.aggregates = {});
  const nonNull = (vals) => vals.filter((v) => v != null);
  const numeric = (vals, name) => nonNull(vals).map((v) => { if (typeof v === 'number') return v; if (v instanceof XTime) return v.ms; throw new XQLError(`${name}() needs a numeric field but got ${XQL.typeOf(v)}`); });
  A.count = { needsArg: false, fn: (vals, rows, hasArg) => (hasArg ? nonNull(vals).length : rows.length) };
  A.count_distinct = { needsArg: true, fn: (vals) => { const seen = []; for (const v of nonNull(vals)) if (!seen.some((s) => XQL.equals(s, v, true))) seen.push(v); return seen.length; } };
  A.sum = { needsArg: true, fn: (vals) => { const ns = numeric(vals, 'sum'); return ns.length ? ns.reduce((a, b) => a + b, 0) : null; } };
  A.avg = { needsArg: true, fn: (vals) => { const ns = numeric(vals, 'avg'); return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null; } };
  A.median = { needsArg: true, fn: (vals) => { const ns = numeric(vals, 'median').sort((a, b) => a - b); if (!ns.length) return null; const m = ns.length >> 1; return ns.length % 2 ? ns[m] : (ns[m - 1] + ns[m]) / 2; } };
  A.min = { needsArg: true, fn: (vals) => { const vs = nonNull(vals); return vs.length ? vs.reduce((m, v) => (XQL.compare(v, m) < 0 ? v : m)) : null; } };
  A.max = { needsArg: true, fn: (vals) => { const vs = nonNull(vals); return vs.length ? vs.reduce((m, v) => (XQL.compare(v, m) > 0 ? v : m)) : null; } };
  A.values = { needsArg: true, fn: (vals) => { const out = []; for (const v of nonNull(vals)) if (!out.some((s) => XQL.equals(s, v, true))) out.push(v); return out; } };
  A.list = { needsArg: true, fn: (vals) => nonNull(vals) };
  A.earliest = { needsArg: true, fn: (vals) => (vals.length ? vals[0] : null) };
  A.first = A.earliest;
  A.latest = { needsArg: true, fn: (vals) => (vals.length ? vals[vals.length - 1] : null) };
  A.last = A.latest;
  A.stddev_population = { needsArg: true, fn: (vals) => { const ns = numeric(vals, 'stddev_population'); if (!ns.length) return null; const m = ns.reduce((a, b) => a + b, 0) / ns.length; return Math.sqrt(ns.reduce((a, b) => a + (b - m) ** 2, 0) / ns.length); } };
  A.stddev_sample = { needsArg: true, fn: (vals) => { const ns = numeric(vals, 'stddev_sample'); if (ns.length < 2) return null; const m = ns.reduce((a, b) => a + b, 0) / ns.length; return Math.sqrt(ns.reduce((a, b) => a + (b - m) ** 2, 0) / (ns.length - 1)); } };
  A.approx_count = A.count_distinct;
})(typeof globalThis !== 'undefined' ? globalThis : this);
