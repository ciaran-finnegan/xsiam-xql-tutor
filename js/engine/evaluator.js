// XQL Tutor - evaluator
// Runs a parsed XQL query against the in-memory sample datasets and records a per-stage trace.
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const { XQLError, XTime } = XQL;

  // event_type values follow the xdr_data schema reference; event_sub_type names are the subset used by the sample tenant
  // (the product stores integers; the sandbox stores the names so that ENUM.FILE_WRITE reads naturally).
  const SUB_TYPES = ['PROCESS_START', 'PROCESS_STOP', 'NETWORK_CREATE', 'NETWORK_CLOSE', 'NETWORK_STATISTICS', 'NETWORK_FAILED', 'FILE_CREATE_NEW', 'FILE_OPEN', 'FILE_READ', 'FILE_WRITE', 'FILE_RENAME', 'FILE_REMOVE', 'FILE_SET_ATTRIBUTES', 'REGISTRY_CREATE_KEY', 'REGISTRY_DELETE_KEY', 'REGISTRY_RENAME_KEY', 'REGISTRY_SET_VALUE', 'REGISTRY_DELETE_VALUE', 'LOAD_IMAGE', 'INJECTION_CREATE_REMOTE_THREAD', 'INJECTION_QUEUE_APC', 'USER_STATUS_LOGON', 'USER_STATUS_LOGOFF'];
  const ENUMS = (XQL.ENUMS = {
    event_type: { PROCESS: 1, NETWORK: 2, FILE: 3, REGISTRY: 4, INJECTION: 5, LOAD_IMAGE: 6, USER_STATUS_CHANGE: 7, TIME_CHANGE: 8, THREAD: 9, CAUSALITY: 10, HOST_STATUS_CHANGE: 11, AGENT_STATUS_CHANGE: 12, INTERNAL_STATISTICS: 13, PROCESS_HANDLE: 14, EVENT_LOG: 15, EPM_STATUS: 16, METADATA_CHANGE: 17, SYSTEM_CALL: 18, DEVICE: 19, HOST_FIREWALL: 23 },
    event_sub_type: Object.fromEntries(SUB_TYPES.map((s) => [s, s])),
    agent_os_type: { AGENT_OS_WINDOWS: 1, AGENT_OS_MAC: 2, AGENT_OS_LINUX: 4 },
    action_process_signature_status: { SIGNATURE_SIGNED: 1, SIGNATURE_SIGNED_INVALID: 2, SIGNATURE_UNSIGNED: 3, SIGNATURE_FAILED_TO_OBTAIN: 4, SIGNATURE_WEAK_HASH: 5 },
    actor_process_signature_status: { SIGNATURE_SIGNED: 1, SIGNATURE_SIGNED_INVALID: 2, SIGNATURE_UNSIGNED: 3, SIGNATURE_FAILED_TO_OBTAIN: 4, SIGNATURE_WEAK_HASH: 5 },
  });
  const ENUM_NAMES = {};
  for (const f of Object.keys(ENUMS)) { if (f === 'event_sub_type') continue; ENUM_NAMES[f] = {}; for (const [k, v] of Object.entries(ENUMS[f])) ENUM_NAMES[f][v] = k; }
  XQL.enumName = (field, value) => (ENUM_NAMES[field] && ENUM_NAMES[field][value]) || null;

  const SYSTEM_FIELDS = ['_time', '_insert_time', '_product', '_vendor', '_tag', '_id'];
  const PRESETS = {
    xdr_process: { dataset: 'xdr_data', filter: (r) => r.event_type === 1 },
    xdr_file: { dataset: 'xdr_data', filter: (r) => r.event_type === 3 },
    xdr_registry: { dataset: 'xdr_data', filter: (r) => r.event_type === 4 },
    xdr_image_load: { dataset: 'xdr_data', filter: (r) => r.event_type === 6 },
    network_story: { dataset: 'xdr_data', filter: (r) => r.event_type === 2 },
  };

  const isEnumMarker = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof XTime) && '__enum' in v;
  const truthy = (v) => v === true;

  function describeNode(n) {
    switch (n.t) {
      case 'field': return n.name;
      case 'str': return `"${n.v}"`;
      case 'num': return String(n.v);
      case 'null': return 'null';
      case 'bool': return String(n.v);
      case 'enum': return 'ENUM.' + n.name;
      case 'call': return n.name + '(...)';
      default: return 'expression';
    }
  }

  // ---- tables -------------------------------------------------------------
  function makeTable(columns, rows, extra) { return Object.assign({ columns: columns.slice(), rows, removed: {} }, extra || {}); }
  // The product does not preserve sort order through join, union, dedup and arrayexpand. The sandbox models that with a
  // deterministic reorder (hash of the row contents) so results are stable but unrelated to the input order.
  function scramble(rows) {
    const key = (r) => { let h = 2166136261; const s = JSON.stringify(r, (k, v) => (v instanceof XTime ? v.ms : v)); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
    return rows.map((r, i) => ({ r, k: key(r) * 7 + i })).sort((a, b) => a.k - b.k).map((x) => x.r);
  }
  const ORDER_LOSING = { join: 1, union: 1, dedup: 1, arrayexpand: 1 };
  function colLookup(table) {
    const map = new Map();
    for (const c of table.columns) map.set(c.toLowerCase(), c);
    for (const r of table.rows.slice(0, 1)) for (const k of Object.keys(r)) if (!map.has(k.toLowerCase())) map.set(k.toLowerCase(), k);
    return map;
  }
  function resolveColumn(table, name, stageName, pos) {
    const map = colLookup(table);
    const hit = map.get(name.toLowerCase());
    if (hit) return hit;
    if (table.removed[name.toLowerCase()]) {
      const by = table.removed[name.toLowerCase()];
      throw new XQLError(`Field '${name}' is no longer available: it was dropped by the ${by} stage${by === 'comp' ? ' (only the by fields and the aggregates survive comp)' : by === 'fields' ? ' (add it to the fields list if you need it later)' : ''}.`, pos);
    }
    const s = XQL.suggest(name, [...map.values()]);
    throw new XQLError(`Unknown field '${name}'${stageName ? ` in ${stageName}` : ''}.${s ? ` Did you mean '${s}'?` : ''}`, pos);
  }

  // ---- context --------------------------------------------------------------
  function makeCtx(opts) {
    opts = opts || {};
    return {
      datasets: opts.datasets || XQL.DATASETS || {},
      now: opts.now != null ? opts.now : XQL.NOW || Date.now(),
      caseSensitive: false,
      timeframe: null,
      trace: [],
      warnings: [],
      view: null,
      target: null,
      traceEnabled: opts.trace !== false,
      depth: opts.depth || 0,
    };
  }
  function childCtx(ctx) { const c = makeCtx({ datasets: ctx.datasets, now: ctx.now, trace: false, depth: ctx.depth + 1 }); c.caseSensitive = ctx.caseSensitive; c.timeframe = ctx.timeframe; c.warnings = ctx.warnings; if (c.depth > 8) throw new XQLError('Sub-queries are nested too deeply'); return c; }

  // ---- expression evaluation --------------------------------------------------
  function evalExpr(node, row, env, ctx) {
    switch (node.t) {
      case 'num': case 'bool': return node.v;
      case 'str': return node.v;
      case 'null': return null;
      case 'duration': return XQL.durationMs(node.v.value, node.v.unit);
      case 'enum': {
        if (node.xdmConst) {
          const table = XQL.XDM_CONST || {};
          if (!(node.name in table)) { const s = XQL.suggest(node.name, Object.keys(table)); throw new XQLError(`XDM_CONST.${node.name} is not known to the sandbox.${s ? ` Did you mean XDM_CONST.${s}?` : ''} Known: ${Object.keys(table).join(', ')}`, node.pos); }
          return table[node.name];
        }
        return { __enum: node.name };
      }
      case 'field': return resolveFieldValue(node, row, env);
      case 'call': return evalCall(node, row, env, ctx);
      case 'neg': { const v = evalExpr(node.e, row, env, ctx); if (v == null) return null; if (typeof v !== 'number') throw new XQLError('Unary minus needs a number'); return -v; }
      case 'not': { const v = evalExpr(node.e, row, env, ctx); if (v == null) return null; return !truthy(v); }
      case 'bin': {
        const l = evalExpr(node.l, row, env, ctx);
        if (node.op === 'and') { if (!truthy(l)) return false; return truthy(evalExpr(node.r, row, env, ctx)); }
        if (node.op === 'or') { if (truthy(l)) return true; return truthy(evalExpr(node.r, row, env, ctx)); }
        throw new XQLError('Unknown operator ' + node.op);
      }
      case 'arith': return evalArith(node, row, env, ctx);
      case 'cmp': return evalCmp(node, row, env, ctx);
      case 'in': return evalIn(node, row, env, ctx);
      case 'sub': throw new XQLError('A sub-query can only be used with in (...), join or union', node.pos);
      default: throw new XQLError('Cannot evaluate expression of type ' + node.t);
    }
  }

  function resolveFieldValue(node, row, env) {
    const name = node.name;
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    const lc = env.lc.get(name.toLowerCase());
    if (lc && Object.prototype.hasOwnProperty.call(row, lc)) return row[lc];
    const dot = name.indexOf('.');
    if (dot > 0 && env.aliases) {
      const alias = name.slice(0, dot), rest = name.slice(dot + 1);
      const ar = env.aliases[alias.toLowerCase()];
      if (ar) {
        if (Object.prototype.hasOwnProperty.call(ar, rest)) return ar[rest];
        const k = Object.keys(ar).find((x) => x.toLowerCase() === rest.toLowerCase());
        if (k) return ar[k];
        const s = XQL.suggest(rest, Object.keys(ar));
        throw new XQLError(`Field '${rest}' does not exist in the joined sub-query '${alias}'.${s ? ` Did you mean '${alias}.${s}'?` : ''}`, node.pos);
      }
    }
    if (env.rightRows) { // join: lenient lookup of a bare right-side field
      for (const ar of Object.values(env.aliases || {})) { if (Object.prototype.hasOwnProperty.call(ar, name)) return ar[name]; }
    }
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) return { __enum: name };
    if (env.removed && env.removed[name.toLowerCase()]) {
      const by = env.removed[name.toLowerCase()];
      throw new XQLError(`Field '${name}' is no longer available: it was dropped by the ${by} stage${by === 'comp' ? ' (only the by fields and the aggregates survive comp)' : by === 'fields' ? ' (add it to the fields list if you need it later)' : ''}.`, node.pos);
    }
    const s = XQL.suggest(name, env.columns);
    throw new XQLError(`Unknown field '${name}'${env.datasetName ? ` in ${env.datasetName}` : ''}.${s ? ` Did you mean '${s}'?` : ''}`, node.pos);
  }

  function evalCall(node, row, env, ctx) {
    const name = node.name;
    const fn = XQL.functions[name];
    if (!fn) {
      if (XQL.aggregates[name] || XQL.AGG_FUNCS.has(name)) throw new XQLError(`${name}() is an aggregation function. Use it inside a comp stage: comp ${name}(${node.args.length ? describeNode(node.args[0]) : ''}) as alias by field`, node.pos);
      const s = XQL.suggest(name, Object.keys(XQL.functions));
      throw new XQLError(`Unknown function '${name}'.${s ? ` Did you mean ${s}()?` : ''}`, node.pos);
    }
    if (node.args.length < fn.min || node.args.length > fn.max) throw new XQLError(`${name}() expects ${fn.min === fn.max ? fn.min : `${fn.min} to ${fn.max}`} argument${fn.max === 1 ? '' : 's'}: ${fn.doc}`, node.pos);
    const args = node.args.map((a) => evalExpr(a, row, env, ctx));
    for (const a of args) if (isEnumMarker(a)) throw new XQLError(`'${a.__enum}' is not a known field or value. Strings need double quotes: "${a.__enum}"`, node.pos);
    return fn.fn(args, ctx);
  }

  function evalArith(node, row, env, ctx) {
    const l = evalExpr(node.l, row, env, ctx), r = evalExpr(node.r, row, env, ctx);
    if (l == null || r == null) return null;
    if (typeof l === 'string' || typeof r === 'string') throw new XQLError(`Cannot use '${node.op}' on strings. Use concat() to join strings or to_number() to convert.`);
    const lt = l instanceof XTime, rt = r instanceof XTime;
    const a = Number(l), b = Number(r);
    if (typeof l !== 'number' && !lt) throw new XQLError(`'${node.op}' needs numbers but got ${XQL.typeOf(l)}`);
    if (typeof r !== 'number' && !rt) throw new XQLError(`'${node.op}' needs numbers but got ${XQL.typeOf(r)}`);
    switch (node.op) {
      case '+': return lt || rt ? new XTime(a + b) : a + b;
      case '-': return lt && rt ? a - b : lt ? new XTime(a - b) : a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : a / b;
    }
  }

  function resolveEnumFor(otherNode, enumName, pos) {
    const fname = otherNode && otherNode.t === 'field' ? otherNode.name.split('.').pop().toLowerCase() : null;
    const table = fname && ENUMS[fname];
    if (table) {
      if (enumName in table) return table[enumName];
      const s = XQL.suggest(enumName, Object.keys(table));
      throw new XQLError(`${enumName} is not a value of ${fname}${fname === 'event_sub_type' ? ' known to the sandbox' : ''}.${s ? ` Did you mean ENUM.${s}?` : ''} Known values: ${Object.keys(table).slice(0, 12).join(', ')}${Object.keys(table).length > 12 ? ', ...' : ''}`, pos);
    }
    return enumName;
  }

  function typeMismatch(node, l, r) {
    const lt = XQL.typeOf(l), rt = XQL.typeOf(r);
    let hint = '';
    const lname = node.l.t === 'field' ? node.l.name.split('.').pop().toLowerCase() : null;
    if (lt === 'number' && rt === 'string' && node.r.t === 'str' && lname && ENUMS[lname] && ENUMS[lname][node.r.v.toUpperCase()] != null) hint = ` ${lname} is an enum field: write ${describeNode(node.l)} ${node.op} ENUM.${node.r.v.toUpperCase()} (or the number ${ENUMS[lname][node.r.v.toUpperCase()]}) without quotes.`;
    else if (lt === 'number' && rt === 'string' && node.r.t === 'str') hint = ` ${describeNode(node.l)} holds numbers, so compare it with a number: ${describeNode(node.l)} ${node.op} ${node.r.v.replace(/"/g, '')}`;
    if (lt === 'string' && rt === 'number' && node.r.t === 'num') hint = ` ${describeNode(node.l)} holds text, so quote the value: ${describeNode(node.l)} ${node.op} "${node.r.v}"`;
    if (lt === 'timestamp' && rt === 'string') hint = ' Compare timestamps with to_timestamp("2026-10-26 09:00:00") or use config timeframe.';
    return new XQLError(`Type mismatch: ${describeNode(node.l)} is ${lt} but ${describeNode(node.r)} is ${rt}.${hint}`, node.pos);
  }

  function valuesEqual(node, l, r, lNode, rNode, ctx) {
    const cs = ctx.caseSensitive;
    if (typeof l === 'string' && typeof r === 'string') {
      if (rNode && rNode.t === 'str' && r.includes('*')) return XQL.patternMatch(l, r, cs);
      if (lNode && lNode.t === 'str' && l.includes('*')) return XQL.patternMatch(r, l, cs);
      return XQL.strEq(l, r, cs);
    }
    if (l instanceof XTime && typeof r === 'string') { const ms = XQL.parseTimeString(r); if (ms == null) throw typeMismatch(node, l, r); return l.ms === ms; }
    if (typeof l === 'number' && typeof r === 'number') return l === r;
    if (typeof l === 'boolean' && typeof r === 'boolean') return l === r;
    if (l instanceof XTime && (r instanceof XTime || typeof r === 'number')) return Number(l) === Number(r);
    if (Array.isArray(l) && Array.isArray(r)) return XQL.equals(l, r, cs);
    if (Array.isArray(l) && !Array.isArray(r)) return l.some((x) => XQL.equals(x, r, cs));
    if (typeof l === 'object' || typeof r === 'object') return JSON.stringify(l) === JSON.stringify(r);
    throw typeMismatch(node, l, r);
  }

  function evalCmp(node, row, env, ctx) {
    let l = evalExpr(node.l, row, env, ctx), r = evalExpr(node.r, row, env, ctx);
    if (isEnumMarker(l) && isEnumMarker(r)) throw new XQLError(`Neither '${l.__enum}' nor '${r.__enum}' is a known field. Strings need double quotes.`, node.pos);
    if (isEnumMarker(l)) l = resolveEnumFor(node.r, l.__enum, node.pos);
    if (isEnumMarker(r)) r = resolveEnumFor(node.l, r.__enum, node.pos);
    const op = node.op;
    // SQL three-valued logic: a comparison with a null operand is null (never true), so filter drops the row and
    // `not` of it is still null. Only an explicit `= null` / `!= null` test is true or false.
    if (op === '=' || op === '!=') {
      if (l == null || r == null) {
        const explicitNull = node.l.t === 'null' || node.r.t === 'null';
        const eq = l == null && r == null;
        if (explicitNull) return op === '=' ? eq : !eq;
        return null;
      }
      const eq = valuesEqual(node, l, r, node.l, node.r, ctx);
      return op === '=' ? eq : !eq;
    }
    if (op === '<' || op === '<=' || op === '>' || op === '>=') {
      if (l == null || r == null) return null;
      const lt = XQL.typeOf(l), rt = XQL.typeOf(r);
      if (lt === 'timestamp' && rt === 'string') { const ms = XQL.parseTimeString(r); if (ms == null) throw typeMismatch(node, l, r); r = new XTime(ms); }
      else if (!((lt === 'number' || lt === 'timestamp') && (rt === 'number' || rt === 'timestamp')) && lt !== rt) throw typeMismatch(node, l, r);
      const c = XQL.compare(l, r);
      return op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0;
    }
    if (op === '~=' || op === '!~=') {
      if (l == null) return null;
      if (typeof l !== 'string') throw new XQLError(`'~=' needs a string on the left but ${describeNode(node.l)} is ${XQL.typeOf(l)}`, node.pos);
      if (typeof r !== 'string') throw new XQLError(`'~=' needs a regular expression string on the right`, node.pos);
      const m = XQL.toRegex(r).test(l);
      return op === '~=' ? m : !m;
    }
    if (op === 'contains') {
      if (l == null || r == null) return null;
      let res;
      if (Array.isArray(l)) res = l.some((x) => XQL.equals(x, r, ctx.caseSensitive));
      else if (typeof l === 'string') { const needle = typeof r === 'string' ? r : XQL.display(r); res = ctx.caseSensitive ? l.includes(needle) : l.toLowerCase().includes(needle.toLowerCase()); }
      else if (typeof l === 'number') res = String(l).includes(String(r));
      else throw new XQLError(`'contains' works on strings and arrays, but ${describeNode(node.l)} is ${XQL.typeOf(l)}`, node.pos);
      return node.negate ? !res : res;
    }
    if (op === 'incidr') {
      if (l == null) return null;
      const res = XQL.inCidr(String(l), String(r));
      return node.negate ? !res : res;
    }
    if (op === 'incidr6') throw new XQLError('incidr6 (IPv6) is not supported in the tutor sandbox', node.pos);
    throw new XQLError('Unknown comparison ' + op, node.pos);
  }

  function evalIn(node, row, env, ctx) {
    const l0 = evalExpr(node.l, row, env, ctx);
    const l = isEnumMarker(l0) ? resolveEnumFor(null, l0.__enum, node.pos) : l0;
    let found = false;
    if (node.sub) {
      const key = JSON.stringify(node.sub);
      ctx._subCache = ctx._subCache || new Map();
      let vals = ctx._subCache.get(key);
      if (!vals) {
        const res = executeQuery(node.sub, childCtx(ctx));
        if (!res.columns.length) throw new XQLError('The sub-query inside in (...) returned no columns', node.pos);
        if (res.columns.length > 1) ctx.warnings.push(`The sub-query inside in (...) returns ${res.columns.length} columns; only the first (${res.columns[0]}) is used. Add a fields stage with one field.`);
        vals = res.rows.map((r) => r[res.columns[0]]);
        ctx._subCache.set(key, vals);
      }
      found = vals.some((v) => (l == null ? v == null : v != null && (typeof v === typeof l || v instanceof XTime) && XQL.equals(l, v, ctx.caseSensitive)));
    } else {
      let listHasNull = false;
      for (const item of node.items) {
        let v = evalExpr(item, row, env, ctx);
        if (isEnumMarker(v)) v = resolveEnumFor(node.l, v.__enum, node.pos);
        if (v == null) { listHasNull = true; if (l == null) { found = true; break; } continue; }
        if (l == null) continue;
        if (XQL.typeOf(l) !== XQL.typeOf(v) && !(l instanceof XTime)) throw typeMismatch({ l: node.l, r: item, op: 'in', pos: node.pos }, l, v);
        if (valuesEqual({ l: node.l, r: item, op: 'in', pos: node.pos }, l, v, node.l, item, ctx)) { found = true; break; }
      }
      // SQL null semantics: a null value is neither in nor not in a list, unless null is listed explicitly
      if (l == null && !listHasNull) return null;
    }
    return node.negate ? !found : found;
  }

  // ---- stage helpers ------------------------------------------------------------
  function makeEnv(table, extra) {
    const lc = new Map();
    const cols = table.columns.slice();
    for (const c of cols) lc.set(c.toLowerCase(), c);
    if (table.rows.length) for (const k of Object.keys(table.rows[0])) if (!lc.has(k.toLowerCase())) { lc.set(k.toLowerCase(), k); cols.push(k); }
    return Object.assign({ columns: cols, lc, removed: table.removed, datasetName: table.datasetName }, extra || {});
  }

  function timeframeBounds(tf, now) {
    if (!tf) return null;
    const rel = (s) => {
      const str = String(s).trim().toLowerCase();
      if (str === 'now') return now;
      if (str === 'begin') return 0;
      const m = str.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*([a-z]+)$/);
      if (m) return now + (m[1] === '-' ? -1 : 1) * XQL.durationMs(Number(m[2]), m[3]);
      const abs = XQL.parseTimeString(s);
      if (abs == null) throw new XQLError(`Cannot understand timeframe value "${s}". Use "now", "begin", "-30m" or "2026-10-26 09:00:00 UTC"`);
      return abs;
    };
    if (tf.between) return { start: rel(tf.between[0]), end: rel(tf.between[1]) };
    return { start: now - XQL.durationMs(tf.value, tf.unit), end: now };
  }

  function loadDataset(name, mode, ctx, pos) {
    const key = String(name).toLowerCase();
    let ds = ctx.datasets[key];
    let presetFilter = null;
    if (mode === 'preset') {
      const p = PRESETS[key];
      if (!p) throw new XQLError(`Preset '${name}' is not available in the sandbox. Supported presets: ${Object.keys(PRESETS).join(', ')}`, pos);
      ds = ctx.datasets[p.dataset];
      presetFilter = p.filter;
    }
    if (!ds) {
      const names = Object.keys(ctx.datasets);
      const s = XQL.suggest(key, names);
      throw new XQLError(`Dataset '${name}' does not exist in the sandbox.${s ? ` Did you mean '${s}'?` : ''} Available: ${names.join(', ')}`, pos);
    }
    let rows = ds.rows.map((r) => Object.assign({}, r));
    if (presetFilter) rows = rows.filter(presetFilter);
    if (mode === 'preset' && PRESETS[key].extraRows) rows = rows.concat(PRESETS[key].extraRows.map((r) => Object.assign({}, r))).sort((a, b) => XQL.compare(a._time, b._time));
    const tf = timeframeBounds(ctx.timeframe, ctx.now);
    if (tf && rows.length && rows[0]._time !== undefined) rows = rows.filter((r) => r._time != null && Number(r._time) >= tf.start && Number(r._time) <= tf.end);
    return makeTable(ds.columns, rows, { datasetName: key });
  }

  // datamodel: the Cortex Data Model view of one, several or all mapped datasets
  function loadDatamodel(st, ctx) {
    const maps = XQL.XDM_MAPPINGS || {};
    const names = st.names ? st.names.map((n) => String(n).toLowerCase()) : Object.keys(maps);
    const rows = [];
    for (const name of names) {
      const ds = ctx.datasets[name];
      if (!ds) { const s = XQL.suggest(name, Object.keys(ctx.datasets)); throw new XQLError(`Dataset '${name}' does not exist in the sandbox.${s ? ` Did you mean '${s}'?` : ''}`, st.start); }
      const map = maps[name];
      if (!map) throw new XQLError(`'${name}' has no data model mapping in the sandbox. Mapped datasets: ${Object.keys(maps).join(', ')}`, st.start);
      for (const r of ds.rows) {
        const x = map(r);
        if (!x) continue;
        const o = { _time: r._time, _dataset: name, _product: r._product == null ? null : r._product, _vendor: r._vendor == null ? null : r._vendor };
        for (const f of XQL.XDM_FIELDS) o[f] = f in x ? x[f] : null;
        rows.push(o);
      }
    }
    rows.sort((a, b) => XQL.compare(a._time, b._time));
    const tf = timeframeBounds(ctx.timeframe, ctx.now);
    const kept = tf ? rows.filter((r) => r._time != null && Number(r._time) >= tf.start && Number(r._time) <= tf.end) : rows;
    return makeTable(['_time', '_dataset', ...XQL.XDM_FIELDS], kept, { datasetName: 'datamodel' });
  }

  function stageFilter(st, table, ctx) {
    const env = makeEnv(table);
    const rows = table.rows.filter((r) => {
      const v = evalExpr(st.expr, r, env, ctx);
      if (v !== true && v !== false && v != null) throw new XQLError(`filter expects a condition that is true or false, but the expression gives ${XQL.typeOf(v)}. Compare the value to something, for example: filter ${st.src.replace(/^filter\s+/, '')} = "..."`, st.start);
      return truthy(v);
    });
    return makeTable(table.columns, rows, { removed: table.removed, datasetName: table.datasetName });
  }

  function stageFields(st, table, ctx) {
    const removed = Object.assign({}, table.removed);
    const allCols = makeEnv(table).columns;
    if (st.mode === 'exclude') {
      const drop = new Set();
      for (const it of st.items) {
        if (it.wildcard) { const re = new RegExp('^' + it.name.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); for (const c of table.columns) if (re.test(c)) drop.add(c); }
        else drop.add(resolveColumn(table, it.name, 'fields', st.start));
      }
      const columns = table.columns.filter((c) => !drop.has(c));
      for (const d of drop) removed[d.toLowerCase()] = 'fields';
      const rows = table.rows.map((r) => { const o = Object.assign({}, r); for (const d of drop) if (!SYSTEM_FIELDS.includes(d)) delete o[d]; return o; });
      return makeTable(columns, rows, { removed, datasetName: table.datasetName });
    }
    const selected = []; // [{src, out}]
    for (const it of st.items) {
      const fs = /^fieldset\.(.+)$/i.exec(it.name);
      if (fs) {
        const list = (XQL.XDM_FIELDSETS || {})[fs[1].toLowerCase()];
        if (!list) throw new XQLError(`Unknown fieldset '${it.name}'. The sandbox knows: ${Object.keys(XQL.XDM_FIELDSETS || {}).map((k) => 'fieldset.' + k).join(', ')}`, st.start);
        for (const f of list) if (allCols.includes(f)) selected.push({ src: f, out: f });
        continue;
      }
      if (it.wildcard) {
        const re = new RegExp('^' + it.name.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
        const hits = allCols.filter((c) => re.test(c));
        if (!hits.length) throw new XQLError(`No field matches '${it.name}'`, st.start);
        for (const h of hits) selected.push({ src: h, out: h });
      } else {
        const src = resolveColumn(table, it.name, 'fields', st.start);
        selected.push({ src, out: it.alias || src });
      }
    }
    const columns = [];
    for (const s of selected) if (!columns.includes(s.out)) columns.push(s.out);
    const keep = new Set(selected.map((s) => s.out.toLowerCase()));
    for (const c of allCols) if (!keep.has(c.toLowerCase())) {
      const alias = selected.find((s) => s.src === c && s.out !== c);
      removed[c.toLowerCase()] = alias ? `fields (renamed to '${alias.out}', so use that name from here on)` : 'fields';
    }
    for (const s of selected) { delete removed[s.out.toLowerCase()]; }
    const rows = table.rows.map((r) => {
      const o = {};
      for (const s of selected) o[s.out] = r[s.src];
      for (const sys of SYSTEM_FIELDS) if (sys in r && !(sys in o)) o[sys] = r[sys]; // retained but hidden
      return o;
    });
    return makeTable(columns, rows, { removed, datasetName: table.datasetName });
  }

  function stageAlter(st, table, ctx) {
    const columns = table.columns.slice();
    const removed = Object.assign({}, table.removed);
    const env = makeEnv(table);
    const rows = table.rows.map((r) => Object.assign({}, r));
    for (const a of st.assignments) {
      const existing = env.lc.get(a.name.toLowerCase());
      const name = existing || a.name;
      for (const r of rows) {
        const v = evalExpr(a.expr, r, env, ctx);
        if (isEnumMarker(v)) throw new XQLError(`'${v.__enum}' is not a known field. Strings need double quotes: "${v.__enum}"`, st.start);
        r[name] = v;
      }
      if (!existing) { columns.push(name); env.columns.push(name); env.lc.set(name.toLowerCase(), name); }
      delete removed[name.toLowerCase()];
    }
    return makeTable(columns, rows, { removed, datasetName: table.datasetName });
  }

  function chronological(rows) {
    if (!rows.length || rows[0]._time === undefined) return rows;
    return rows.slice().sort((a, b) => XQL.compare(a._time, b._time));
  }

  function stageComp(st, table, ctx) {
    const env = makeEnv(table);
    const byCols = st.by.map((b) => resolveColumn(table, b, 'comp by', st.start));
    const groups = new Map();
    for (const r of table.rows) {
      const keyVals = byCols.map((c) => r[c]);
      const arrCol = byCols.find((c, i) => Array.isArray(keyVals[i]));
      if (arrCol) throw new XQLError(`comp cannot group by '${arrCol}' because it is an array field (the product fails with "XQL query failed"). Convert it first: alter ${arrCol}_s = to_string(${arrCol}) and group by that, or arrayexpand ${arrCol}.`, st.start);
      const key = JSON.stringify(keyVals.map((v) => (v instanceof XTime ? 't' + v.ms : typeof v === 'string' && !ctx.caseSensitive ? v.toLowerCase() : v)));
      let g = groups.get(key);
      if (!g) { g = { keyVals, rows: [] }; groups.set(key, g); }
      g.rows.push(r);
    }
    const outCols = byCols.slice();
    const aggSpecs = st.aggs.map((a) => {
      const agg = XQL.aggregates[a.func];
      if (!agg) {
        if (XQL.functions[a.func]) throw new XQLError(`${a.func}() is not an aggregation. comp accepts count, count_distinct, sum, avg, min, max, values, list, earliest, latest, first, last, median. Compute ${a.func}() in an alter stage before comp.`, st.start);
        const s = XQL.suggest(a.func, Object.keys(XQL.aggregates));
        throw new XQLError(`Unknown aggregation '${a.func}'.${s ? ` Did you mean ${s}()?` : ''}`, st.start);
      }
      if (agg.needsArg && !a.arg) throw new XQLError(`${a.func}() needs a field: comp ${a.func}(field) as alias`, st.start);
      if (a.arg && a.arg.t === 'field') resolveColumn(table, a.arg.name, 'comp', st.start);
      let alias = a.alias;
      if (!alias) alias = a.arg && a.arg.t === 'field' ? `${a.func}_${a.arg.name}` : a.func;
      return { agg, arg: a.arg, alias, func: a.func };
    });
    for (const s of aggSpecs) if (!outCols.includes(s.alias)) outCols.push(s.alias);
    const rows = [];
    for (const g of groups.values()) {
      const chrono = chronological(g.rows);
      const out = {};
      byCols.forEach((c, i) => { out[c] = g.keyVals[i]; });
      for (const s of aggSpecs) {
        const vals = s.arg ? chrono.map((r) => evalExpr(s.arg, r, env, ctx)) : [];
        out[s.alias] = s.agg.fn(vals, chrono, !!s.arg, ctx);
      }
      rows.push(out);
    }
    const removed = {};
    for (const c of env.columns) if (!outCols.includes(c)) removed[c.toLowerCase()] = 'comp';
    if (st.addrawdata) ctx.warnings.push('addrawdata is ignored in the sandbox.');
    return makeTable(outCols, rows, { removed, datasetName: table.datasetName });
  }

  function sortRows(rows, keys, table, st) {
    const cols = keys.map((k) => ({ col: resolveColumn(table, k.field, 'sort', st.start), dir: k.dir === 'desc' ? -1 : 1 }));
    const idx = rows.map((r, i) => ({ r, i }));
    idx.sort((a, b) => {
      for (const k of cols) { const c = XQL.compare(a.r[k.col], b.r[k.col]) * k.dir; if (c !== 0) return c; }
      return a.i - b.i;
    });
    return idx.map((x) => x.r);
  }
  function stageSort(st, table, ctx) {
    for (const k of st.keys) if (k.implicit) ctx.warnings.push(`'sort ${k.field}' has no direction, so it sorts ascending. The documented form is 'sort asc ${k.field}' or 'sort desc ${k.field}'.`);
    return makeTable(table.columns, sortRows(table.rows, st.keys, table, st), { removed: table.removed, datasetName: table.datasetName });
  }
  function stageLimit(st, table) { return makeTable(table.columns, table.rows.slice(0, st.n), { removed: table.removed, datasetName: table.datasetName }); }

  function stageDedup(st, table, ctx) {
    const cols = st.fields.map((f) => resolveColumn(table, f, 'dedup', st.start));
    const byCol = st.by ? resolveColumn(table, st.by.field, 'dedup by', st.start) : null;
    const seen = new Map();
    for (const r of table.rows) {
      const key = JSON.stringify(cols.map((c) => { const v = r[c]; return v instanceof XTime ? 't' + v.ms : typeof v === 'string' && !ctx.caseSensitive ? v.toLowerCase() : v; }));
      const cur = seen.get(key);
      if (!cur) { seen.set(key, r); continue; }
      if (byCol) {
        const c = XQL.compare(r[byCol], cur[byCol]);
        if ((st.by.dir === 'asc' && c < 0) || (st.by.dir === 'desc' && c > 0)) seen.set(key, r);
      }
    }
    return makeTable(table.columns, [...seen.values()], { removed: table.removed, datasetName: table.datasetName });
  }

  function stageBin(st, table, ctx) {
    const col = resolveColumn(table, st.field, 'bin', st.start);
    const rows = table.rows.map((r) => Object.assign({}, r));
    const vals = rows.map((r) => r[col]).filter((v) => v != null);
    const isTime = vals.length && vals[0] instanceof XTime;
    if (vals.some((v) => !(typeof v === 'number' || v instanceof XTime))) throw new XQLError(`bin needs a numeric or timestamp field, but ${col} contains ${XQL.typeOf(vals.find((v) => !(typeof v === 'number' || v instanceof XTime)))}`, st.start);
    let size, origin = 0;
    if (st.span) {
      if (isTime) {
        if (!st.span.unit) throw new XQLError(`bin on a timestamp needs a time unit, for example: bin ${col} span = 1h`, st.start);
        size = XQL.durationMs(st.span.value, st.span.unit);
        if (st.timeshift != null) origin = st.timeshift * 1000;
      } else {
        if (st.span.unit) throw new XQLError(`${col} is numeric, so span must be a plain number (for example span = 100)`, st.start);
        size = st.span.value;
      }
    } else {
      if (!vals.length) return makeTable(table.columns, rows, { removed: table.removed, datasetName: table.datasetName });
      const nums = vals.map(Number);
      const min = Math.min(...nums), max = Math.max(...nums);
      size = (max - min) / st.bins || 1;
      if (!isTime) size = Math.max(1, Math.ceil(size));
      origin = min;
    }
    if (!(size > 0)) throw new XQLError('bin size must be positive', st.start);
    for (const r of rows) {
      const v = r[col];
      if (v == null) continue;
      const n = Number(v);
      let b = Math.floor((n - origin) / size) * size + origin;
      if (st.bins && n === origin + size * st.bins) b = origin + size * (st.bins - 1);
      r[col] = isTime ? new XTime(b) : b;
    }
    return makeTable(table.columns, rows, { removed: table.removed, datasetName: table.datasetName });
  }

  function stageJoin(st, table, ctx) {
    const right = executeQuery(st.sub, childCtx(ctx));
    const alias = st.alias.toLowerCase();
    const leftCols = table.columns.slice();
    const rightCols = right.columns.slice();
    const conflicts = rightCols.filter((c) => leftCols.some((l) => l.toLowerCase() === c.toLowerCase()));
    const outCols = leftCols.slice();
    for (const c of rightCols) {
      if (!conflicts.includes(c)) outCols.push(c);
      else if (st.conflict === 'both') outCols.push(`${st.alias}.${c}`);
    }
    const env = makeEnv(table, { aliases: {}, rightRows: true });
    for (const c of rightCols) if (!env.lc.has(c.toLowerCase())) { env.columns.push(c); }
    const merge = (l, r) => {
      const o = {};
      for (const c of leftCols) o[c] = l ? l[c] : null;
      for (const sys of SYSTEM_FIELDS) if (l && sys in l && !(sys in o)) o[sys] = l[sys];
      for (const c of rightCols) {
        const v = r ? r[c] : null;
        if (!conflicts.includes(c)) o[c] = v;
        else if (st.conflict === 'right') { if (r) o[c] = v; }
        else if (st.conflict === 'both') o[`${st.alias}.${c}`] = v;
      }
      return o;
    };
    const out = [];
    const matchedRight = new Set();
    for (const l of table.rows) {
      let matched = false;
      for (let i = 0; i < right.rows.length; i++) {
        const r = right.rows[i];
        env.aliases[alias] = r;
        if (truthy(evalExpr(st.on, l, env, ctx))) { matched = true; matchedRight.add(i); out.push(merge(l, r)); }
      }
      if (!matched && st.type === 'left') out.push(merge(l, null));
    }
    if (st.type === 'right') right.rows.forEach((r, i) => { if (!matchedRight.has(i)) out.push(merge(null, r)); });
    const removed = Object.assign({}, table.removed);
    for (const c of outCols) delete removed[c.toLowerCase()];
    return makeTable(outCols, out, { removed, datasetName: table.datasetName });
  }

  function stageUnion(st, table, ctx) {
    const other = st.sub ? executeQuery(st.sub, childCtx(ctx)) : loadDataset(st.dataset, 'dataset', ctx, st.start);
    const outCols = table.columns.slice();
    for (const c of other.columns) if (!outCols.some((x) => x.toLowerCase() === c.toLowerCase())) outCols.push(c);
    const norm = (r) => { const o = {}; for (const c of outCols) { const k = Object.keys(r).find((x) => x.toLowerCase() === c.toLowerCase()); o[c] = k ? r[k] : null; } for (const sys of SYSTEM_FIELDS) if (sys in r && !(sys in o)) o[sys] = r[sys]; return o; };
    const rows = table.rows.map(norm).concat(other.rows.map(norm));
    return makeTable(outCols, rows, { removed: {}, datasetName: table.datasetName });
  }

  function stageReplacenull(st, table, ctx) {
    const col = resolveColumn(table, st.field, 'replacenull', st.start);
    const env = makeEnv(table);
    const rows = table.rows.map((r) => {
      const v = r[col];
      if (v == null || (Array.isArray(v) && v.length === 0)) { const o = Object.assign({}, r); o[col] = evalExpr(st.value, r, env, ctx); return o; }
      return r;
    });
    return makeTable(table.columns, rows, { removed: table.removed, datasetName: table.datasetName });
  }

  function stageArrayexpand(st, table, ctx) {
    const col = resolveColumn(table, st.field, 'arrayexpand', st.start);
    const rows = [];
    for (const r of table.rows) {
      const v = r[col];
      if (v == null) continue;
      if (!Array.isArray(v)) throw new XQLError(`arrayexpand needs an array field, but ${col} is ${XQL.typeOf(v)}`, st.start);
      const items = st.limit ? v.slice(0, st.limit) : v;
      for (const it of items) { const o = Object.assign({}, r); o[col] = it; rows.push(o); }
    }
    return makeTable(table.columns, rows, { removed: table.removed, datasetName: table.datasetName });
  }

  function stageTop(st, table, ctx) {
    const col = resolveColumn(table, st.field, 'top', st.start);
    const byCols = st.by.map((b) => resolveColumn(table, b, 'top by', st.start));
    const countName = st.countAlias || 'TOP_COUNT', pctName = st.percentAlias || 'TOP_PERCENT';
    const groups = new Map();
    for (const r of table.rows) {
      const gk = JSON.stringify(byCols.map((c) => r[c]));
      let g = groups.get(gk);
      if (!g) { g = { keyVals: byCols.map((c) => r[c]), counts: new Map(), total: 0 }; groups.set(gk, g); }
      const v = r[col];
      const vk = JSON.stringify(v instanceof XTime ? 't' + v.ms : typeof v === 'string' && !ctx.caseSensitive ? v.toLowerCase() : v);
      const e = g.counts.get(vk) || { value: v, n: 0 };
      e.n++; g.counts.set(vk, e); g.total++;
    }
    const rows = [];
    for (const g of groups.values()) {
      const sorted = [...g.counts.values()].sort((a, b) => b.n - a.n).slice(0, st.n);
      for (const e of sorted) {
        const o = {};
        byCols.forEach((c, i) => { o[c] = g.keyVals[i]; });
        o[col] = e.value; o[countName] = e.n; o[pctName] = Math.round((e.n / g.total) * 10000) / 100;
        rows.push(o);
      }
    }
    return makeTable([...byCols, col, countName, pctName], rows, { removed: {}, datasetName: table.datasetName });
  }

  function stageTag(st, table) {
    const columns = table.columns.includes('_tag') ? table.columns.slice() : [...table.columns, '_tag'];
    const rows = table.rows.map((r) => { const o = Object.assign({}, r); o._tag = (Array.isArray(r._tag) ? r._tag : []).concat(st.tags); return o; });
    return makeTable(columns, rows, { removed: table.removed, datasetName: table.datasetName });
  }

  function stageWindowcomp(st, table, ctx) {
    const env = makeEnv(table);
    const byCols = st.by.map((b) => resolveColumn(table, b, 'windowcomp by', st.start));
    const sortKeys = st.sort.map((k) => ({ col: resolveColumn(table, k.field, 'windowcomp sort', st.start), dir: k.dir === 'desc' ? -1 : 1 }));
    const func = st.func;
    const alias = st.alias || (st.arg && st.arg.t === 'field' ? `${func}_${st.arg.name}` : func);
    const parts = new Map();
    table.rows.forEach((r, i) => { const k = JSON.stringify(byCols.map((c) => r[c])); if (!parts.has(k)) parts.set(k, []); parts.get(k).push({ r, i }); });
    const results = new Array(table.rows.length);
    for (const part of parts.values()) {
      const ordered = part.slice().sort((a, b) => { for (const k of sortKeys) { const c = XQL.compare(a.r[k.col], b.r[k.col]) * k.dir; if (c) return c; } return a.i - b.i; });
      const vals = ordered.map((x) => (st.arg ? evalExpr(st.arg, x.r, env, ctx) : null));
      ordered.forEach((x, pos) => {
        let v;
        if (func === 'row_number') v = pos + 1;
        else if (func === 'rank' || func === 'dense_rank') {
          let rank = 1, dense = 1;
          for (let j = 1; j <= pos; j++) { const same = sortKeys.every((k) => XQL.compare(ordered[j].r[k.col], ordered[j - 1].r[k.col]) === 0); if (!same) { dense++; rank = j + 1; } }
          v = func === 'rank' ? rank : dense;
        } else if (func === 'lag') v = pos > 0 ? vals[pos - 1] : null;
        else if (func === 'first_value') v = vals.length ? vals[0] : null;
        else if (func === 'last_value') v = st.sort.length && !st.between ? vals[pos] : vals[vals.length - 1];
        else {
          const agg = XQL.aggregates[func];
          if (!agg) throw new XQLError(`windowcomp does not support ${func}()`, st.start);
          let lo = 0, hi = ordered.length - 1;
          if (st.between) { lo = st.between.lo == null ? 0 : Math.max(0, pos + st.between.lo); hi = st.between.hi == null ? ordered.length - 1 : Math.min(ordered.length - 1, pos + st.between.hi); }
          else if (st.sort.length) { hi = pos; }
          const frameRows = ordered.slice(lo, hi + 1).map((x) => x.r);
          const frameVals = vals.slice(lo, hi + 1);
          v = agg.fn(frameVals, frameRows, !!st.arg, ctx);
        }
        results[x.i] = v;
      });
    }
    const columns = table.columns.includes(alias) ? table.columns.slice() : [...table.columns, alias];
    const rows = table.rows.map((r, i) => { const o = Object.assign({}, r); o[alias] = results[i]; return o; });
    return makeTable(columns, rows, { removed: table.removed, datasetName: table.datasetName });
  }

  function stageIploc(st, table, ctx) {
    const col = resolveColumn(table, st.field, 'iploc', st.start);
    const items = st.items.length ? st.items : [{ name: 'loc_country', alias: null }, { name: 'loc_city', alias: null }, { name: 'loc_latlon', alias: null }];
    const columns = table.columns.slice();
    for (const it of items) { const out = it.alias || it.name; if (!columns.includes(out)) columns.push(out); }
    const geo = XQL.GEOIP || {};
    const rows = table.rows.map((r) => {
      const o = Object.assign({}, r);
      const g = r[col] != null ? geo[String(r[col])] : null;
      for (const it of items) { const out = it.alias || it.name; o[out] = g ? (g[it.name.replace(/^loc_/, '')] ?? null) : null; }
      return o;
    });
    return makeTable(columns, rows, { removed: table.removed, datasetName: table.datasetName });
  }

  // ---- query execution ----------------------------------------------------------
  function applyStage(st, table, ctx, index, total, sourceIndex) {
    if (st.unsupported) throw new XQLError(`The '${st.kind}' stage is not executed by the tutor sandbox (it is covered in the reading exercises instead).`, st.start);
    if (index > sourceIndex && (st.kind === 'dataset' || st.kind === 'datamodel')) throw new XQLError(`'${st.src.split(/\s/)[0]}' must be the first stage (after an optional config). To combine datasets use union or join.`, st.start);
    switch (st.kind) {
      case 'config': ctx.caseSensitive = !!st.settings.case_sensitive; ctx.timeframe = st.settings.timeframe || null; return null;
      case 'datamodel': return loadDatamodel(st, ctx);
      case 'dataset': {
        if (st.mode === 'in') { let t = null; for (const n of st.names) { const d = loadDataset(n, 'dataset', ctx, st.start); t = t ? unionTables(t, d) : d; } return t; }
        return loadDataset(st.names[0], st.mode, ctx, st.start);
      }
      case 'filter': return stageFilter(st, table, ctx);
      case 'fields': return stageFields(st, table, ctx);
      case 'alter': return stageAlter(st, table, ctx);
      case 'comp': return stageComp(st, table, ctx);
      case 'sort': return stageSort(st, table, ctx);
      case 'limit': return stageLimit(st, table);
      case 'dedup': return stageDedup(st, table, ctx);
      case 'bin': return stageBin(st, table, ctx);
      case 'join': return stageJoin(st, table, ctx);
      case 'union': return stageUnion(st, table, ctx);
      case 'replacenull': return stageReplacenull(st, table, ctx);
      case 'arrayexpand': return stageArrayexpand(st, table, ctx);
      case 'top': return stageTop(st, table, ctx);
      case 'target': if (index !== total - 1) throw new XQLError('target must be the last stage of the query', st.start); ctx.target = { type: st.type, name: st.name, append: st.append }; return table;
      case 'view': ctx.view = { mode: st.mode, opts: st.opts }; return table;
      case 'tag': return stageTag(st, table);
      case 'windowcomp': return stageWindowcomp(st, table, ctx);
      case 'iploc': return stageIploc(st, table, ctx);
      default: throw new XQLError(`Stage '${st.kind}' is not supported`, st.start);
    }
  }
  // dataset in (...) helper: union of two loaded tables
  function unionTables(table, other) {
    const outCols = table.columns.slice();
    for (const c of other.columns) if (!outCols.includes(c)) outCols.push(c);
    const norm = (r) => { const o = {}; for (const c of outCols) o[c] = c in r ? r[c] : null; return o; };
    return makeTable(outCols, table.rows.map(norm).concat(other.rows.map(norm)), { removed: {}, datasetName: table.datasetName });
  }

  function executeQuery(ast, ctx) {
    let stages = ast.stages;
    const first = stages[0];
    const isSource = (s) => s && (s.kind === 'dataset' || s.kind === 'datamodel' || s.kind === 'search');
    const startsWithSource = isSource(first) || (first && first.kind === 'config' && isSource(stages[1]));
    if (!startsWithSource) {
      const insertAt = first && first.kind === 'config' ? 1 : 0;
      stages = stages.slice();
      stages.splice(insertAt, 0, { kind: 'dataset', mode: 'dataset', names: ['xdr_data'], src: 'dataset = xdr_data', implicit: true, start: first ? first.start : 0, end: first ? first.start : 0 });
      ctx.warnings.push('No dataset stage was given, so the query ran against the default dataset xdr_data. Start queries with: dataset = xdr_data');
    }
    let table = null;
    const sourceIndex = stages[0].kind === 'config' ? 1 : 0;
    let sortedBy = null; // src of the most recent sort whose order is still intact
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      if (st.kind !== 'config' && st.kind !== 'dataset' && st.kind !== 'datamodel' && !table) throw new XQLError(`'${st.kind}' needs data to work on. Put a dataset stage first.`, st.start);
      const before = table ? table.rows.length : 0;
      let t = applyStage(st, table, ctx, i, stages.length, sourceIndex);
      if (t && ORDER_LOSING[st.kind]) {
        t = makeTable(t.columns, scramble(t.rows), { removed: t.removed, datasetName: t.datasetName });
        if (sortedBy) ctx.warnings.push(`'${st.kind}' does not preserve the order from the earlier '${sortedBy}'. Put the sort stage after the ${st.kind}.`);
      }
      if (st.kind === 'sort') sortedBy = st.src;
      else if (ORDER_LOSING[st.kind] || st.kind === 'comp' || st.kind === 'top') sortedBy = null;
      if (t) table = t;
      if (ctx.traceEnabled) ctx.trace.push({ kind: st.kind, src: st.src, implicit: !!st.implicit, rowsIn: before, rowsOut: table ? table.rows.length : 0, columns: table ? table.columns.slice() : [], rows: table ? table.rows.slice(0, 200) : [], start: st.start, end: st.end });
    }
    return table;
  }

  function run(src, opts) {
    const ctx = makeCtx(opts);
    const ast = XQL.parse(src);
    const table = executeQuery(ast, ctx);
    return { columns: table.columns, rows: table.rows, trace: ctx.trace, warnings: ctx.warnings, view: ctx.view, target: ctx.target, ast, caseSensitive: ctx.caseSensitive, timeframe: ctx.timeframe };
  }

  // ---- result comparison (used to grade write / cloze / parsons exercises) -----------
  function normVal(v) {
    if (v == null) return null;
    if (v instanceof XTime) return 't' + v.ms;
    if (typeof v === 'number') return Math.round(v * 1e6) / 1e6;
    if (Array.isArray(v)) return v.map(normVal).map((x) => JSON.stringify(x)).sort();
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }
  function getCI(row, col) { if (col in row) return row[col]; const k = Object.keys(row).find((x) => x.toLowerCase() === col.toLowerCase()); return k ? row[k] : null; }
  function isOrdered(ast) {
    // a result is order-sensitive if a sort stage is not followed by a stage that destroys order
    let ordered = false;
    for (const st of ast.stages) {
      if (st.kind === 'sort') ordered = true;
      else if (['comp', 'dedup', 'join', 'union', 'top', 'arrayexpand', 'bin'].includes(st.kind)) ordered = false;
    }
    return ordered;
  }
  XQL.isOrdered = isOrdered;
  XQL.compareResults = (expected, actual, opts) => {
    opts = opts || {};
    // System fields such as _time are always shown by the product, so listing or omitting them is never a grading difference.
    const isSys = (c) => SYSTEM_FIELDS.includes(c.toLowerCase());
    expected = { columns: expected.columns.filter((c) => !isSys(c)), rows: expected.rows };
    actual = { columns: actual.columns.filter((c) => !isSys(c)), rows: actual.rows };
    const ecols = expected.columns.map((c) => c.toLowerCase());
    const acols = actual.columns.map((c) => c.toLowerCase());
    const missing = expected.columns.filter((c) => !acols.includes(c.toLowerCase()));
    const extra = actual.columns.filter((c) => !ecols.includes(c.toLowerCase()));
    if (missing.length || extra.length) {
      const parts = [];
      if (missing.length) parts.push(`missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
      if (extra.length) parts.push(`unexpected column${extra.length > 1 ? 's' : ''}: ${extra.join(', ')}`);
      return { ok: false, kind: 'columns', reason: `The columns differ (${parts.join('; ')}).`, missing, extra };
    }
    const key = (row) => JSON.stringify(expected.columns.map((c) => normVal(getCI(row, c))));
    const ek = expected.rows.map(key), ak = actual.rows.map(key);
    if (ek.length !== ak.length) return { ok: false, kind: 'rows', reason: `Expected ${ek.length} row${ek.length === 1 ? '' : 's'} but got ${ak.length}.`, expectedRows: ek.length, actualRows: ak.length };
    if (opts.ordered) {
      for (let i = 0; i < ek.length; i++) if (ek[i] !== ak[i]) {
        const sortedSame = ek.slice().sort().join('\n') === ak.slice().sort().join('\n');
        return { ok: false, kind: sortedSame ? 'order' : 'values', reason: sortedSame ? `The rows are right but in the wrong order (first difference at row ${i + 1}). Check the sort direction and field.` : `Row ${i + 1} differs from the expected result.`, row: i };
      }
      return { ok: true };
    }
    const es = ek.slice().sort(), as = ak.slice().sort();
    for (let i = 0; i < es.length; i++) if (es[i] !== as[i]) {
      const missingRows = ek.filter((k) => !ak.includes(k)).length;
      return { ok: false, kind: 'values', reason: `${missingRows} expected row${missingRows === 1 ? ' is' : 's are'} missing or have different values.`, missingRows };
    }
    return { ok: true };
  };

  XQL.run = run;
  XQL.makeCtx = makeCtx;
  XQL.executeQuery = executeQuery;
  XQL.SYSTEM_FIELDS = SYSTEM_FIELDS;
  XQL.PRESETS = PRESETS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
