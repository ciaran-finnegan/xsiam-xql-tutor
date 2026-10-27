// XQL Tutor - parser
// Builds an AST from tokens. Stage syntax follows the Cortex XQL command reference.
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const { XQLError } = XQL;

  const STAGES = ['config', 'dataset', 'preset', 'cold_dataset', 'datamodel', 'filter', 'fields', 'alter', 'comp', 'sort', 'limit', 'dedup', 'bin',
    'join', 'union', 'replacenull', 'arrayexpand', 'top', 'target', 'view', 'tag', 'windowcomp', 'transaction', 'iploc', 'search',
    'call', 'pivot', 'transpose', 'getrole'];
  const UNSUPPORTED = { transaction: 1, iploc: 0, search: 1, call: 1, pivot: 1, transpose: 1, getrole: 1 };
  const EXPR_KEYWORDS = new Set(['and', 'or', 'not', 'in', 'contains', 'incidr', 'incidr6', 'as', 'by', 'null', 'true', 'false', 'between', 'addrawdata', 'limit']);
  const AGG_FUNCS = new Set(['count', 'count_distinct', 'sum', 'avg', 'min', 'max', 'values', 'list', 'earliest', 'latest', 'first', 'last', 'median', 'stddev_population', 'stddev_sample', 'var', 'approx_count', 'approx_top', 'rank', 'row_number', 'dense_rank', 'first_value', 'last_value', 'lag']);

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function suggest(word, candidates, max = 3) {
    let best = null, bestD = Infinity;
    for (const c of candidates) {
      const d = levenshtein(word.toLowerCase(), c.toLowerCase());
      if (d < bestD) { bestD = d; best = c; }
    }
    return bestD <= max ? best : null;
  }
  XQL.suggest = suggest;

  class Parser {
    constructor(tokens, src) { this.toks = tokens; this.i = 0; this.src = src; }
    peek(k = 0) { return this.toks[Math.min(this.i + k, this.toks.length - 1)]; }
    next() { return this.toks[this.i++]; }
    atEnd() { return this.peek().type === 'eof'; }
    isOp(v, k = 0) { const t = this.peek(k); return t.type === 'op' && t.value === v; }
    isKw(w, k = 0) { const t = this.peek(k); return t.type === 'ident' && t.value.toLowerCase() === w; }
    fail(msg, tok, hint) { throw new XQLError(msg, (tok || this.peek()).start, hint); }
    expectOp(v, what) {
      if (!this.isOp(v)) this.fail(`Expected '${v}'${what ? ' ' + what : ''} but found ${this.describe(this.peek())}`);
      return this.next();
    }
    expectKw(w) {
      if (!this.isKw(w)) this.fail(`Expected '${w}' but found ${this.describe(this.peek())}`);
      return this.next();
    }
    expectIdent(what) {
      const t = this.peek();
      if (t.type !== 'ident') this.fail(`Expected ${what || 'a name'} but found ${this.describe(t)}`);
      return this.next().value;
    }
    describe(t) {
      if (t.type === 'eof') return 'end of query';
      if (t.type === 'string') return `string "${t.value}"`;
      if (t.type === 'duration') return `'${t.text}'`;
      return `'${t.type === 'number' ? t.text : t.value}'`;
    }
    stageEnd() { return this.atEnd() || this.isOp('|') || this.isOp(')'); }

    // ---- query / stages -------------------------------------------------
    parseQuery(top) {
      const stages = [];
      if (this.isOp('|')) this.fail("A query cannot start with '|'. Start with a dataset, for example: dataset = xdr_data");
      for (;;) {
        if (this.atEnd() || this.isOp(')')) {
          if (stages.length === 0) this.fail('Empty query. Start with: dataset = xdr_data');
          break;
        }
        const startTok = this.peek();
        const stage = this.parseStage(stages.length === 0, top);
        stage.start = startTok.start;
        stage.end = this.peek().start;
        stage.src = this.src.slice(stage.start, this.toks[this.i - 1].end).trim();
        stages.push(stage);
        if (this.isOp('|')) { this.next(); if (this.atEnd() || this.isOp(')')) this.fail("Query ends with a dangling '|'. Remove it or add another stage after the pipe."); continue; }
        if (!this.stageEnd()) this.fail(`Unexpected ${this.describe(this.peek())}. Stages must be separated by '|'.`);
      }
      return { stages };
    }

    parseStage(isFirst, top) {
      const t = this.peek();
      if (t.type !== 'ident') this.fail(`Expected a stage keyword (filter, fields, comp, ...) but found ${this.describe(t)}`);
      const name = t.value.toLowerCase();
      if (!STAGES.includes(name)) {
        const s = suggest(name, STAGES);
        this.fail(`Unknown stage '${t.value}'.${s ? ` Did you mean '${s}'?` : ''}`, t, 'Stages: dataset, filter, fields, alter, comp, sort, limit, dedup, bin, join, union, replacenull, arrayexpand, top, config, target, view, tag, windowcomp');
      }
      this.next();
      switch (name) {
        case 'config': return this.parseConfig(isFirst);
        case 'dataset': case 'preset': case 'cold_dataset': return this.parseDataset(name);
        case 'datamodel': return this.parseDatamodel();
        case 'filter': return { kind: 'filter', expr: this.parseExpr() };
        case 'fields': return this.parseFields();
        case 'alter': return this.parseAlter();
        case 'comp': return this.parseComp();
        case 'sort': return this.parseSort();
        case 'limit': return this.parseLimit();
        case 'dedup': return this.parseDedup();
        case 'bin': return this.parseBin();
        case 'join': return this.parseJoin();
        case 'union': return this.parseUnion();
        case 'replacenull': return this.parseReplacenull();
        case 'arrayexpand': return this.parseArrayexpand();
        case 'top': return this.parseTop();
        case 'target': return this.parseTarget();
        case 'view': return this.parseView();
        case 'tag': return this.parseTag();
        case 'windowcomp': return this.parseWindowcomp();
        case 'iploc': return this.parseIploc();
        default: return this.parseUnsupported(name);
      }
    }

    parseUnsupported(name) {
      let depth = 0;
      while (!this.atEnd() && !(depth === 0 && (this.isOp('|') || this.isOp(')')))) {
        if (this.isOp('(')) depth++;
        if (this.isOp(')')) depth--;
        this.next();
      }
      return { kind: name, unsupported: true };
    }

    parseConfig(isFirst) {
      if (!isFirst) this.fail("'config' must be the very first stage of the query (before dataset).");
      const settings = {};
      let any = false;
      for (;;) {
        if (this.isKw('case_sensitive')) {
          this.next(); this.expectOp('=', 'after case_sensitive');
          const v = this.peek();
          if (!(v.type === 'ident' && ['true', 'false'].includes(v.value.toLowerCase()))) this.fail('case_sensitive must be true or false');
          this.next(); settings.case_sensitive = v.value.toLowerCase() === 'true'; any = true; continue;
        }
        if (this.isKw('timeframe')) {
          this.next();
          if (this.isKw('between')) {
            this.next();
            const a = this.peek(); if (a.type !== 'string') this.fail('timeframe between expects quoted values, for example: config timeframe between "-30m" and "now"'); this.next();
            this.expectKw('and');
            const b = this.peek(); if (b.type !== 'string') this.fail('timeframe between expects two quoted values'); this.next();
            settings.timeframe = { between: [a.value, b.value] }; any = true; continue;
          }
          this.expectOp('=', 'after timeframe');
          const d = this.peek();
          if (d.type === 'duration') { this.next(); settings.timeframe = { value: d.value.value, unit: d.value.unit }; any = true; continue; }
          if (d.type === 'number') this.fail(`timeframe needs a unit, for example: config timeframe = ${d.text}d (units: s, m, h, d, w, mo, y)`);
          this.fail('timeframe expects a duration such as 7d, 24h or 30m');
        }
        break;
      }
      if (!any) this.fail("config expects 'case_sensitive = true|false' or 'timeframe = 7d'");
      return { kind: 'config', settings };
    }

    parseDataset(kw) {
      if (kw === 'dataset' && this.isKw('in')) {
        this.next(); this.expectOp('(', 'after dataset in');
        const names = [];
        do { const t = this.peek(); if (t.type !== 'ident' && t.type !== 'string') this.fail('Expected a dataset name'); this.next(); names.push(t.value); if (this.isOp(',')) { this.next(); continue; } break; } while (true);
        this.expectOp(')');
        return { kind: 'dataset', mode: 'in', names };
      }
      if (this.isOp('=')) this.next();
      const t = this.peek();
      if (t.type !== 'ident' && t.type !== 'string') this.fail(`Expected a ${kw} name, for example: ${kw} = xdr_data`);
      this.next();
      return { kind: 'dataset', mode: kw, names: [t.value] };
    }

    parseDatamodel() {
      // datamodel | datamodel dataset = name | datamodel dataset = * | datamodel dataset in (a, b)
      const st = { kind: 'datamodel', names: null };
      if (this.isKw('dataset')) {
        this.next();
        if (this.isKw('in')) {
          this.next(); this.expectOp('(', 'after dataset in');
          st.names = [];
          do { const t = this.peek(); if (t.type !== 'ident' && t.type !== 'string') this.fail('Expected a dataset name'); this.next(); st.names.push(t.value); if (this.isOp(',')) { this.next(); continue; } break; } while (true);
          this.expectOp(')');
        } else {
          this.expectOp('=', 'after dataset');
          const t = this.peek();
          if (t.type === 'op' && t.value === '*') { this.next(); st.names = null; }
          else if (t.type === 'ident' || t.type === 'string') { this.next(); st.names = [t.value]; }
          else this.fail('datamodel dataset expects a dataset name or *');
        }
      }
      if (!this.stageEnd()) this.fail(`Unexpected ${this.describe(this.peek())} after datamodel. Syntax: datamodel dataset = <name> | datamodel dataset in (a, b) | datamodel`);
      return st;
    }

    parseFieldName() {
      // handles wildcards such as event_* or *_name (tokens must be adjacent)
      let t = this.peek();
      let name = '';
      if (t.type === 'op' && t.value === '*') { this.next(); name = '*'; t = this.peek(); if (t.type === 'ident' && t.start === this.toks[this.i - 1].end) { this.next(); name += t.value; } return name; }
      if (t.type !== 'ident') this.fail(`Expected a field name but found ${this.describe(t)}`);
      this.next(); name = t.value;
      if (EXPR_KEYWORDS.has(name.toLowerCase())) this.fail(`'${name}' is a keyword, not a field name`);
      while (this.isOp('*') && this.peek().start === this.toks[this.i - 1].end) {
        this.next(); name += '*';
        const n2 = this.peek();
        if (n2.type === 'ident' && n2.start === this.toks[this.i - 1].end) { this.next(); name += n2.value; }
      }
      return name;
    }

    parseFields() {
      let mode = 'include';
      if (this.isOp('-')) { this.next(); mode = 'exclude'; }
      const items = [];
      do {
        const name = this.parseFieldName();
        let alias = null;
        if (this.isKw('as')) { this.next(); alias = this.expectIdent('an alias after as'); }
        if (this.isOp('(')) this.fail(`Functions are not allowed in the fields stage. Use alter to compute a new field: alter ${name}_x = ${name}(...)`);
        items.push({ name, alias, wildcard: name.includes('*') });
        if (this.isOp(',')) { this.next(); continue; }
        break;
      } while (true);
      if (!this.stageEnd()) this.fail(`Unexpected ${this.describe(this.peek())} in fields stage. Separate field names with commas.`);
      return { kind: 'fields', mode, items };
    }

    parseAlter() {
      const assignments = [];
      do {
        const name = this.expectIdent('a new field name after alter');
        this.expectOp('=', `after '${name}' in alter`);
        assignments.push({ name, expr: this.parseExpr() });
        if (this.isOp(',')) { this.next(); continue; }
        break;
      } while (true);
      return { kind: 'alter', assignments };
    }

    parseAggCall() {
      const t = this.peek();
      if (t.type !== 'ident') this.fail(`Expected an aggregation function (count, sum, avg, min, max, values, ...) but found ${this.describe(t)}`);
      const func = t.value.toLowerCase();
      this.next();
      if (!this.isOp('(')) {
        const s = suggest(func, [...AGG_FUNCS]);
        this.fail(`Aggregation functions need parentheses, for example count() or sum(${func}).${s && s !== func ? ` Did you mean ${s}()?` : ''}`, t);
      }
      this.next();
      let arg = null;
      if (!this.isOp(')')) arg = this.parseExpr();
      this.expectOp(')', `to close ${func}(`);
      let alias = null;
      if (this.isKw('as')) { this.next(); alias = this.expectIdent('an alias after as'); }
      return { func, arg, alias };
    }

    parseComp() {
      const aggs = [];
      do {
        if (this.isKw('by')) this.fail("comp needs at least one aggregation before 'by', for example: comp count() as events by agent_hostname");
        aggs.push(this.parseAggCall());
        if (this.isOp(',')) { this.next(); continue; }
        break;
      } while (true);
      let by = [];
      if (this.isKw('by')) { this.next(); by = this.parseNameList(); }
      let addrawdata = false, rawAlias = null;
      if (this.isKw('addrawdata')) { this.next(); this.expectOp('='); const v = this.expectIdent(); addrawdata = v.toLowerCase() === 'true'; if (this.isKw('as')) { this.next(); rawAlias = this.expectIdent(); } }
      if (!this.stageEnd()) this.fail(`Unexpected ${this.describe(this.peek())} in comp stage. Syntax: comp func(field) as alias [, ...] by field1, field2`);
      return { kind: 'comp', aggs, by, addrawdata, rawAlias };
    }

    parseNameList() {
      const names = [];
      do { names.push(this.parseFieldName()); if (this.isOp(',')) { this.next(); continue; } break; } while (true);
      return names;
    }

    parseSort() {
      const keys = [];
      do {
        const t = this.peek();
        if (t.type === 'ident' && ['asc', 'desc'].includes(t.value.toLowerCase())) {
          this.next();
          const field = this.parseFieldName();
          keys.push({ field, dir: t.value.toLowerCase() });
        } else {
          const field = this.parseFieldName();
          if (this.isKw('asc') || this.isKw('desc')) this.fail(`In XQL the direction comes before the field: sort ${this.peek().value.toLowerCase()} ${field}`, t);
          // the reference lists asc/desc as optional; treat a bare field as ascending but say so
          keys.push({ field, dir: 'asc', implicit: true });
        }
        if (this.isOp(',')) { this.next(); continue; }
        break;
      } while (true);
      return { kind: 'sort', keys };
    }

    parseLimit() {
      const t = this.peek();
      if (t.type !== 'number' || !Number.isInteger(t.value) || t.value < 1) this.fail('limit expects a positive whole number, for example: limit 100');
      this.next();
      return { kind: 'limit', n: t.value };
    }

    parseDedup() {
      const fields = this.parseNameList();
      let by = null;
      if (this.isKw('by')) {
        this.next();
        const d = this.peek();
        if (!(d.type === 'ident' && ['asc', 'desc'].includes(d.value.toLowerCase()))) this.fail("dedup 'by' needs a direction: dedup agent_hostname by asc _time");
        this.next();
        by = { dir: d.value.toLowerCase(), field: this.parseFieldName() };
      }
      return { kind: 'dedup', fields, by };
    }

    parseBin() {
      const field = this.parseFieldName();
      const st = { kind: 'bin', field, span: null, bins: null, timeshift: null, timezone: null };
      while (!this.stageEnd()) {
        const key = this.expectIdent('span or bins').toLowerCase();
        this.expectOp('=', `after ${key}`);
        const v = this.peek();
        if (key === 'span') {
          if (v.type === 'duration') st.span = { value: v.value.value, unit: v.value.unit };
          else if (v.type === 'number') st.span = { value: v.value, unit: null };
          else this.fail('span expects a value such as 1h, 15m, 1d or a number for numeric fields');
          this.next();
        } else if (key === 'bins') { if (v.type !== 'number') this.fail('bins expects a number'); this.next(); st.bins = v.value; }
        else if (key === 'timeshift') { if (v.type !== 'number') this.fail('timeshift expects an epoch number'); this.next(); st.timeshift = v.value; }
        else if (key === 'timezone') { if (v.type !== 'string') this.fail('timezone expects a quoted string such as "+08:00"'); this.next(); st.timezone = v.value; }
        else this.fail(`Unknown bin option '${key}'. Use span = 1h or bins = 10`);
      }
      if (!st.span && !st.bins) this.fail('bin needs span = <duration> (for example span = 1h) or bins = <number>');
      if (st.span && st.bins) this.fail('bin accepts either span or bins, not both');
      return st;
    }

    parseJoin() {
      const st = { kind: 'join', type: 'inner', conflict: 'right', sub: null, alias: null, on: null };
      while (this.isKw('type') || this.isKw('conflict_strategy')) {
        const key = this.next().value.toLowerCase();
        this.expectOp('=', `after ${key}`);
        const v = this.expectIdent().toLowerCase();
        if (key === 'type') { if (!['inner', 'left', 'right'].includes(v)) this.fail('join type must be inner, left or right'); st.type = v; }
        else { if (!['both', 'left', 'right'].includes(v)) this.fail('conflict_strategy must be both, left or right'); st.conflict = v; }
      }
      if (!this.isOp('(')) this.fail('join expects a sub-query in parentheses: join type = inner (dataset = other | fields a, b) as alias alias.a = a');
      this.next();
      st.sub = this.parseQuery(false);
      this.expectOp(')', 'to close the join sub-query');
      if (!this.isKw('as')) this.fail("join needs an alias for the sub-query: ... ) as alias alias.field = field");
      this.next();
      st.alias = this.expectIdent('an alias after as');
      if (this.stageEnd()) this.fail(`join needs a condition after the alias, for example: ${st.alias}.hostname = agent_hostname`);
      st.on = this.parseExpr();
      return st;
    }

    parseUnion() {
      if (this.isOp('(')) { this.next(); const sub = this.parseQuery(false); this.expectOp(')', 'to close the union sub-query'); return { kind: 'union', sub, dataset: null }; }
      const t = this.peek();
      if (t.type !== 'ident' && t.type !== 'string') this.fail('union expects a dataset name or a sub-query in parentheses');
      this.next();
      return { kind: 'union', sub: null, dataset: t.value };
    }

    parseReplacenull() {
      const field = this.parseFieldName();
      this.expectOp('=', `after ${field} in replacenull`);
      return { kind: 'replacenull', field, value: this.parseExpr() };
    }

    parseArrayexpand() {
      const field = this.parseFieldName();
      let limit = null;
      if (this.isKw('limit')) { this.next(); const t = this.peek(); if (t.type !== 'number') this.fail('arrayexpand limit expects a number'); this.next(); limit = t.value; }
      return { kind: 'arrayexpand', field, limit };
    }

    parseTop() {
      let n = 10;
      if (this.peek().type === 'number') n = this.next().value;
      const field = this.parseFieldName();
      let by = [];
      if (this.isKw('by')) { this.next(); by = this.parseNameList(); }
      let countAlias = null, percentAlias = null;
      while (this.isKw('top_count') || this.isKw('top_percent')) {
        const key = this.next().value.toLowerCase();
        this.expectKw('as');
        const alias = this.expectIdent('an alias');
        if (key === 'top_count') countAlias = alias; else percentAlias = alias;
        if (this.isOp(',')) this.next();
      }
      return { kind: 'top', n, field, by, countAlias, percentAlias };
    }

    parseTarget() {
      const st = { kind: 'target', type: null, append: false, name: null };
      while (this.isKw('type') || this.isKw('append')) {
        const key = this.next().value.toLowerCase();
        this.expectOp('=');
        const v = this.expectIdent().toLowerCase();
        if (key === 'type') { if (!['dataset', 'lookup'].includes(v)) this.fail('target type must be dataset or lookup'); st.type = v; }
        else st.append = v === 'true';
      }
      if (!st.type) this.fail('target needs type = dataset or type = lookup');
      const t = this.peek();
      if (t.type !== 'ident' && t.type !== 'string') this.fail('target needs a name for the dataset or lookup');
      this.next(); st.name = t.value;
      return st;
    }

    parseView() {
      const opts = {};
      const sub = this.expectIdent('highlight, graph or column').toLowerCase();
      if (sub === 'column') { this.expectKw('order'); this.expectOp('='); opts.order = this.expectIdent().toLowerCase(); return { kind: 'view', mode: 'column', opts }; }
      while (!this.stageEnd()) {
        const key = this.expectIdent().toLowerCase();
        this.expectOp('=', `after ${key}`);
        const vals = [];
        do { const v = this.peek(); if (!['ident', 'string', 'number'].includes(v.type)) this.fail(`Unexpected ${this.describe(v)} in view`); this.next(); vals.push(v.value); if (this.isOp(',')) { this.next(); continue; } break; } while (true);
        opts[key] = vals.length === 1 ? vals[0] : vals;
      }
      return { kind: 'view', mode: sub, opts };
    }

    parseTag() {
      this.expectKw('add');
      const tags = [];
      do { const t = this.peek(); if (t.type !== 'string' && t.type !== 'ident') this.fail('tag add expects quoted strings'); this.next(); tags.push(String(t.value)); if (this.isOp(',')) { this.next(); continue; } break; } while (true);
      return { kind: 'tag', tags };
    }

    parseWindowcomp() {
      const agg = this.parseAggCall();
      const st = { kind: 'windowcomp', func: agg.func, arg: agg.arg, alias: agg.alias, by: [], sort: [], between: null };
      for (;;) {
        if (this.isKw('by')) { this.next(); st.by = this.parseNameList(); continue; }
        if (this.isKw('sort')) {
          this.next();
          do {
            let dir = 'asc';
            if (this.isKw('asc') || this.isKw('desc')) dir = this.next().value.toLowerCase();
            const field = this.parseFieldName();
            if (this.isKw('asc') || this.isKw('desc')) dir = this.next().value.toLowerCase();
            st.sort.push({ field, dir });
            if (this.isOp(',')) { this.next(); continue; }
            break;
          } while (true);
          continue;
        }
        if (this.isKw('between')) {
          this.next();
          const bound = () => { if (this.isKw('null')) { this.next(); return null; } let sign = 1; if (this.isOp('-')) { this.next(); sign = -1; } const t = this.peek(); if (t.type !== 'number') this.fail('between expects numbers or null'); this.next(); return sign * t.value; };
          const lo = bound(); this.expectKw('and'); const hi = bound();
          st.between = { lo, hi };
          if (this.isKw('frame_type')) { this.next(); this.expectOp('='); st.frameType = this.expectIdent().toLowerCase(); }
          continue;
        }
        if (this.isKw('as')) { this.next(); st.alias = this.expectIdent('an alias'); continue; }
        if (this.isKw('over')) this.fail("The tutor sandbox supports the 'by ... sort ...' form of windowcomp, not the over() form.");
        break;
      }
      return st;
    }

    parseIploc() {
      const field = this.parseFieldName();
      const items = [];
      while (!this.stageEnd()) {
        const name = this.expectIdent('a loc_ field').toLowerCase();
        let alias = null;
        if (this.isKw('as')) { this.next(); alias = this.expectIdent(); }
        items.push({ name, alias });
        if (this.isOp(',')) this.next();
      }
      return { kind: 'iploc', field, items };
    }

    // ---- expressions ----------------------------------------------------
    parseExpr() { return this.parseOr(); }
    parseOr() {
      let left = this.parseAnd();
      while (this.isKw('or')) { this.next(); left = { t: 'bin', op: 'or', l: left, r: this.parseAnd() }; }
      return left;
    }
    parseAnd() {
      let left = this.parseNot();
      while (this.isKw('and')) { this.next(); left = { t: 'bin', op: 'and', l: left, r: this.parseNot() }; }
      return left;
    }
    parseNot() {
      if (this.isKw('not')) { const t = this.next(); return { t: 'not', e: this.parseNot(), pos: t.start }; }
      return this.parseComparison();
    }
    parseComparison() {
      const left = this.parseAdditive();
      const t = this.peek();
      if (t.type === 'op' && ['=', '!=', '<', '<=', '>', '>=', '~=', '!~='].includes(t.value)) {
        this.next();
        if (t.value === '=' && this.isOp('=')) this.fail("Use a single '=' for comparison in XQL, not '=='", t);
        const right = this.parseAdditive();
        return { t: 'cmp', op: t.value, l: left, r: right, pos: t.start };
      }
      let negate = false;
      let k = 0;
      if (this.isKw('not')) { negate = true; k = 1; }
      const kw = this.peek(k);
      if (kw.type === 'ident') {
        const w = kw.value.toLowerCase();
        if (w === 'in') {
          if (negate) this.next();
          this.next();
          return this.parseInList(left, negate, kw);
        }
        if (['contains', 'incidr', 'incidr6'].includes(w)) {
          if (negate) this.next();
          this.next();
          if (w === 'contains' && this.isOp('(') && this.peek(1).type === 'string' && this.peek(2).type === 'op' && this.peek(2).value === ',') this.fail('contains takes a single value. To test several, use in ("a", "b") for exact or wildcard matches, or join contains tests with or.', kw);
          return { t: 'cmp', op: w, negate, l: left, r: this.parseAdditive(), pos: kw.start };
        }
        if (negate) this.fail("'not' must be followed by in, contains or incidr here", kw);
      }
      return left;
    }
    parseInList(left, negate, kw) {
      this.expectOp('(', 'after in');
      // sub-query?
      const n = this.peek();
      if (n.type === 'ident' && ['dataset', 'preset', 'config', 'cold_dataset'].includes(n.value.toLowerCase())) {
        const sub = this.parseQuery(false);
        this.expectOp(')', 'to close the sub-query');
        return { t: 'in', l: left, sub, negate, pos: kw.start };
      }
      const items = [];
      if (!this.isOp(')')) {
        do { items.push(this.parseExpr()); if (this.isOp(',')) { this.next(); continue; } break; } while (true);
      }
      this.expectOp(')', 'to close the in (...) list');
      return { t: 'in', l: left, items, negate, pos: kw.start };
    }
    parseAdditive() {
      let left = this.parseMultiplicative();
      while (this.isOp('+') || this.isOp('-')) { const op = this.next().value; left = { t: 'arith', op, l: left, r: this.parseMultiplicative() }; }
      return left;
    }
    parseMultiplicative() {
      let left = this.parseUnary();
      while (this.isOp('*') || this.isOp('/')) { const op = this.next().value; left = { t: 'arith', op, l: left, r: this.parseUnary() }; }
      return left;
    }
    parseUnary() {
      if (this.isOp('-')) { this.next(); return { t: 'neg', e: this.parseUnary() }; }
      return this.parsePostfix();
    }
    parsePostfix() {
      let e = this.parsePrimary();
      while (this.isOp('->')) {
        this.next();
        // path segments: key, key.sub.key, ["key with dots"], [0], chained in any order
        let path = '';
        let segments = 0;
        for (;;) {
          if (this.isOp('[')) {
            this.next(); const s = this.peek();
            if (s.type === 'string') { this.next(); path += `['${s.value}']`; }
            else if (s.type === 'number' && Number.isInteger(s.value)) { this.next(); path += `[${s.value}]`; }
            else this.fail('Expected a quoted key or an array index inside -> [ ]');
            this.expectOp(']'); segments++; continue;
          }
          if (this.isOp('.') && segments) { this.next(); const id = this.expectIdent('a key after .'); path += '.' + id; segments++; continue; }
          if (this.peek().type === 'ident' && !segments) { path += this.next().value; segments++; continue; }
          break;
        }
        if (!segments) this.fail('Expected a JSON path after ->, for example field -> key or field -> ["key"]');
        let obj = false;
        if (this.isOp('{')) { this.next(); this.expectOp('}'); obj = true; }
        e = { t: 'call', name: obj ? 'json_extract' : 'json_extract_scalar', args: [e, { t: 'str', v: '$.' + path }], sugar: true };
      }
      return e;
    }
    parsePrimary() {
      const t = this.peek();
      if (t.type === 'number') { this.next(); return { t: 'num', v: t.value }; }
      if (t.type === 'string') { this.next(); return { t: 'str', v: t.value, triple: t.triple }; }
      if (t.type === 'duration') { this.next(); return { t: 'duration', v: t.value }; }
      if (t.type === 'op' && t.value === '(') {
        this.next();
        const n = this.peek();
        if (n.type === 'ident' && ['dataset', 'preset', 'config'].includes(n.value.toLowerCase())) {
          const sub = this.parseQuery(false); this.expectOp(')'); return { t: 'sub', query: sub };
        }
        const e = this.parseExpr();
        this.expectOp(')', 'to close the parenthesis');
        return e;
      }
      if (t.type === 'ident') {
        const lower = t.value.toLowerCase();
        if (lower === 'null') { this.next(); return { t: 'null' }; }
        if (lower === 'true' || lower === 'false') { this.next(); return { t: 'bool', v: lower === 'true' }; }
        if (['and', 'or', 'in', 'by', 'as'].includes(lower)) this.fail(`Unexpected keyword '${t.value}' here`, t);
        this.next();
        if (this.isOp('(') && this.peek().start === t.end) {
          this.next();
          const args = [];
          if (!this.isOp(')')) { do { args.push(this.parseExpr()); if (this.isOp(',')) { this.next(); continue; } break; } while (true); }
          this.expectOp(')', `to close ${t.value}(`);
          return { t: 'call', name: lower, args, pos: t.start };
        }
        if (/^enum\./i.test(t.value)) return { t: 'enum', name: t.value.slice(5).toUpperCase(), pos: t.start };
        if (/^xdm_const\./i.test(t.value)) return { t: 'enum', name: t.value.slice(10).toUpperCase(), xdmConst: true, pos: t.start };
        return { t: 'field', name: t.value, pos: t.start };
      }
      if (t.type === 'op' && t.value === '*') { this.next(); return { t: 'field', name: '*', pos: t.start }; }
      this.fail(`Expected a value, field or function but found ${this.describe(t)}`);
    }
  }

  function parse(src) {
    const tokens = XQL.tokenize(src);
    const p = new Parser(tokens, src);
    const q = p.parseQuery(true);
    if (!p.atEnd()) p.fail(`Unexpected ${p.describe(p.peek())} after the end of the query`);
    return q;
  }

  XQL.parse = parse;
  XQL.STAGES = STAGES;
  XQL.AGG_FUNCS = AGG_FUNCS;
  XQL.UNSUPPORTED_STAGES = UNSUPPORTED;
})(typeof globalThis !== 'undefined' ? globalThis : this);
