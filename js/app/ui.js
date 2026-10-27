// XQL Tutor - UI building blocks: DOM helpers, XQL syntax highlighting, result tables, stage trace, exercise renderers
(function (root) {
  const XQL = (root.XQL = root.XQL || {});
  const UI = (XQL.UI = {});

  // ---- DOM helpers ------------------------------------------------------------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return el;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  UI.h = h; UI.esc = esc;
  UI.rich = (text, tag) => h(tag || 'span', { class: 'rich', html: esc(text || '').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') });
  UI.icon = (name) => { const icons = { check: '✓', cross: '✕', bolt: '⚡', book: '📖', play: '▶', hint: '💡', up: '↑', down: '↓', trash: '✕', add: '+', link: '↗', dot: '•' }; return h('span', { class: 'ico', 'aria-hidden': 'true' }, icons[name] || ''); };

  // ---- syntax highlighting ----------------------------------------------------------
  const KW = new Set(XQL.STAGES.concat(['as', 'by', 'and', 'or', 'not', 'in', 'contains', 'incidr', 'incidr6', 'asc', 'desc', 'null', 'true', 'false', 'span', 'bins', 'type', 'conflict_strategy', 'timeframe', 'case_sensitive', 'between', 'add', 'append', 'limit', 'sort']));
  const STAGE_SET = new Set(XQL.STAGES);
  UI.highlight = function (src) {
    let out = '';
    let i = 0;
    const n = src.length;
    let stageStart = true;
    while (i < n) {
      const ch = src[i];
      if (ch === '/' && src[i + 1] === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; out += `<span class="c">${esc(src.slice(i, j))}</span>`; i = j; continue; }
      if (ch === '/' && src[i + 1] === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; out += `<span class="c">${esc(src.slice(i, j))}</span>`; i = j; continue; }
      if (ch === '"') {
        let j;
        if (src.startsWith('"""', i)) { j = src.indexOf('"""', i + 3); j = j < 0 ? n : j + 3; } else { j = i + 1; while (j < n && src[j] !== '"' && src[j] !== '\n') j++; j = Math.min(n, j + 1); }
        out += `<span class="s">${esc(src.slice(i, j))}</span>`; i = j; continue;
      }
      if (/[0-9]/.test(ch)) { let j = i; while (j < n && /[0-9.a-zA-Z]/.test(src[j])) j++; out += `<span class="n">${esc(src.slice(i, j))}</span>`; i = j; continue; }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i; while (j < n && /[A-Za-z0-9_.*]/.test(src[j])) j++;
        const word = src.slice(i, j); const lw = word.toLowerCase();
        let cls = '';
        if (stageStart && STAGE_SET.has(lw)) cls = 'st';
        else if (src[j] === '(') cls = 'f';
        else if (KW.has(lw)) cls = 'k';
        else if (/^enum\./i.test(word) || /^[A-Z][A-Z0-9_]+$/.test(word)) cls = 'e';
        out += cls ? `<span class="${cls}">${esc(word)}</span>` : esc(word);
        i = j; stageStart = false; continue;
      }
      if (ch === '|') { out += '<span class="p">|</span>'; i++; stageStart = true; continue; }
      if (ch === '\n') { out += '\n'; i++; continue; }
      if (/\s/.test(ch)) { out += ch; i++; continue; }
      if (ch === '_' ) { out += ch; i++; continue; }
      out += `<span class="o">${esc(ch)}</span>`; i++;
    }
    return out;
  };
  UI.code = (src, opts) => {
    opts = opts || {};
    const lines = src.split('\n');
    const pre = h('pre', { class: 'xql' + (opts.class ? ' ' + opts.class : '') });
    lines.forEach((line, idx) => {
      const el = h('div', { class: 'line', 'data-line': idx, html: UI.highlight(line) || '&nbsp;' });
      if (opts.onLineClick) { el.classList.add('clickable'); el.addEventListener('click', () => opts.onLineClick(idx, el)); }
      pre.append(el);
    });
    return pre;
  };

  // ---- result table ------------------------------------------------------------------
  UI.cell = (col, v) => {
    if (v == null) return h('span', { class: 'null' }, 'null');
    const en = XQL.enumName(col, v);
    if (en != null) return h('span', { class: 'enum', title: `${col} = ${v}` }, en);
    if (v instanceof XQL.XTime) return h('span', { class: 'ts' }, v.toString());
    if (typeof v === 'number') return h('span', { class: 'num' }, XQL.display(v));
    if (typeof v === 'boolean') return h('span', { class: 'bool' }, String(v));
    if (Array.isArray(v) || typeof v === 'object') return h('span', { class: 'arr', title: JSON.stringify(v) }, JSON.stringify(v));
    const s = String(v);
    return s.length > 90 ? h('span', { title: s }, s.slice(0, 87) + '…') : s;
  };
  UI.table = (result, opts) => {
    opts = opts || {};
    const max = opts.max || 60;
    const cols = result.columns || [];
    const rows = result.rows || [];
    if (!cols.length) return h('div', { class: 'empty' }, 'No columns');
    const t = h('table', { class: 'grid' },
      h('thead', null, h('tr', null, cols.map((c) => h('th', null, c)))),
      h('tbody', null, rows.slice(0, max).map((r) => h('tr', null, cols.map((c) => h('td', null, UI.cell(c, r[c])))))));
    const wrap = h('div', { class: 'tablewrap' }, t);
    const foot = h('div', { class: 'tablefoot' }, `${rows.length} row${rows.length === 1 ? '' : 's'}${rows.length > max ? ` (showing ${max})` : ''} · ${cols.length} column${cols.length === 1 ? '' : 's'}`);
    if (!rows.length) wrap.append(h('div', { class: 'empty' }, 'No rows returned'));
    return h('div', { class: 'result' }, wrap, foot);
  };

  // ---- stage trace (predict / run / investigate) --------------------------------------
  UI.trace = (result, opts) => {
    opts = opts || {};
    const box = h('div', { class: 'trace' });
    const pills = h('div', { class: 'pills' });
    const detail = h('div', { class: 'tracedetail' });
    const steps = result.trace;
    let active = steps.length - 1;
    function show(i) {
      active = i;
      [...pills.children].forEach((p, j) => p.classList.toggle('active', j === i));
      const s = steps[i];
      detail.innerHTML = '';
      detail.append(
        h('div', { class: 'tracehead' }, h('span', { class: 'badge' }, s.kind), h('code', { class: 'src' }, s.src), h('span', { class: 'muted' }, s.kind === 'dataset' || s.kind === 'config' ? `${s.rowsOut} rows` : `${s.rowsIn} → ${s.rowsOut} rows`)),
        s.kind === 'config' ? h('div', { class: 'muted' }, 'Settings applied; nothing to show yet.') : UI.table({ columns: s.columns, rows: s.rows }, { max: opts.max || 25 }));
    }
    steps.forEach((s, i) => {
      pills.append(h('button', { class: 'pill', type: 'button', onClick: () => show(i), title: s.src }, h('b', null, s.kind), h('span', { class: 'cnt' }, s.rowsOut)));
      if (i < steps.length - 1) pills.append(h('span', { class: 'arrow' }, '→'));
    });
    box.append(h('div', { class: 'tracetitle' }, 'Step through the pipeline: click a stage to see the rows after it'), pills, detail);
    show(active);
    return box;
  };

  UI.errorBox = (err, src) => {
    const box = h('div', { class: 'errbox' }, h('div', { class: 'errtitle' }, UI.icon('cross'), ' ', err.name === 'XQLError' ? 'XQL error' : 'Error'), h('div', { class: 'errmsg' }, err.message));
    if (err.hint) box.append(h('div', { class: 'errhint' }, err.hint));
    if (src != null && err.pos != null) {
      const { line, col } = XQL.posToLineCol(src, err.pos);
      const lineText = src.split('\n')[line - 1] || '';
      box.append(h('pre', { class: 'errpos' }, `line ${line}, column ${col}\n${lineText}\n${' '.repeat(Math.max(0, col - 1))}^`));
    }
    return box;
  };

  UI.runBox = (src, opts) => {
    // Runs a query and renders either the error or trace + table
    opts = opts || {};
    try {
      const res = XQL.run(src);
      const parts = [];
      if (res.warnings.length) parts.push(h('div', { class: 'warn' }, res.warnings.map((w) => h('div', null, UI.icon('hint'), ' ', w))));
      if (opts.trace !== false) parts.push(UI.trace(res, { max: opts.max }));
      else parts.push(UI.table(res, { max: opts.max }));
      if (res.view) parts.push(h('div', { class: 'muted small' }, `view ${res.view.mode}: in the Cortex console this would ${res.view.mode === 'graph' ? `render a ${res.view.opts.type || ''} chart` : res.view.mode === 'highlight' ? 'highlight matching values' : 'reorder the columns'}.`));
      if (res.target) parts.push(h('div', { class: 'muted small' }, `target: in the console this would save ${res.rows.length} rows to the ${res.target.type} "${res.target.name}".`));
      return { el: h('div', { class: 'runbox' }, parts), res };
    } catch (e) {
      if (!(e instanceof XQL.XQLError)) console.error(e);
      return { el: UI.errorBox(e, src), err: e };
    }
  };

  // ---- editor ----------------------------------------------------------------------------
  UI.editor = (opts) => {
    opts = opts || {};
    const ta = h('textarea', { class: 'editor', spellcheck: 'false', rows: opts.rows || 6, placeholder: opts.placeholder || 'dataset = xdr_data\n| filter ...' });
    if (opts.value) ta.value = opts.value;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (opts.onRun) opts.onRun(); }
    });
    return ta;
  };

  // ---- choice list (mcq, predict, concept) ----------------------------------------------
  UI.choices = (choices, onPick) => {
    const list = h('div', { class: 'choices' });
    choices.forEach((c, i) => {
      const b = h('button', { class: 'choice', type: 'button', 'data-i': i }, h('span', { class: 'key' }, String(i + 1)), UI.rich(c));
      b.addEventListener('click', () => onPick(i, b));
      list.append(b);
    });
    return list;
  };
  UI.lockChoices = (list, answer, picked) => {
    [...list.querySelectorAll('.choice')].forEach((b, i) => { b.disabled = true; if (i === answer) b.classList.add('correct'); if (i === picked && picked !== answer) b.classList.add('wrong'); });
  };

  // ---- exercise renderers ---------------------------------------------------------------
  // Each renderer returns { el, check: () => outcome | null, reveal: () => void }
  // outcome = { correct: bool, message: string|Element, detail?: Element }
  const R = (UI.renderers = {});

  R.concept = (ex, ctx) => {
    const notes = new Map((ex.notes || []).map((n) => [n.line, n.text]));
    const lines = ex.query.split('\n');
    const annotated = h('div', { class: 'annotated' }, lines.map((line, i) => h('div', { class: 'arow' }, h('pre', { class: 'xql inline', html: UI.highlight(line) }), notes.has(i) ? UI.rich(notes.get(i), 'div') : h('div'))));
    const runArea = h('div');
    const runBtn = h('button', { class: 'btn ghost', type: 'button' }, UI.icon('play'), ' Run and step through');
    runBtn.addEventListener('click', () => { runArea.innerHTML = ''; runArea.append(UI.runBox(ex.query).el); runBtn.disabled = true; });
    let picked = null;
    const list = UI.choices(ex.choices, (i) => { picked = i; ctx.setCanCheck(true); [...list.children].forEach((b, j) => b.classList.toggle('selected', j === i)); });
    const el = h('div', null, h('div', { class: 'worked' }, h('div', { class: 'label' }, 'Worked example'), annotated, runBtn, runArea), h('div', { class: 'question' }, UI.rich(ex.prompt || 'Check your understanding:', 'p'), list));
    return { el, check: () => { if (picked == null) return null; UI.lockChoices(list, ex.answer, picked); return { correct: picked === ex.answer, answer: picked, message: picked === ex.answer ? 'Correct.' : `Not quite. The answer is ${ex.answer + 1}.` }; }, reveal: () => UI.lockChoices(list, ex.answer, picked) };
  };

  R.mcq = (ex, ctx) => {
    let picked = null;
    const list = UI.choices(ex.choices, (i) => { picked = i; ctx.setCanCheck(true); [...list.children].forEach((b, j) => b.classList.toggle('selected', j === i)); });
    const el = h('div', null, ex.query ? UI.code(ex.query) : null, UI.rich(ex.prompt, 'p'), list);
    return { el, check: () => { if (picked == null) return null; UI.lockChoices(list, ex.answer, picked); return { correct: picked === ex.answer, answer: picked, message: picked === ex.answer ? 'Correct.' : `Not quite. The answer is ${ex.answer + 1}.` }; }, reveal: () => UI.lockChoices(list, ex.answer, picked) };
  };

  R.predict = (ex, ctx) => {
    let picked = null;
    const list = UI.choices(ex.choices, (i) => { picked = i; ctx.setCanCheck(true); [...list.children].forEach((b, j) => b.classList.toggle('selected', j === i)); });
    const after = h('div');
    const el = h('div', null, UI.code(ex.query), h('div', { class: 'tools' }, ctx.dataPeekButton()), UI.rich(ex.prompt, 'p'), list, after);
    const showRun = () => { after.innerHTML = ''; after.append(h('div', { class: 'label' }, 'Now run it and investigate'), UI.runBox(ex.query).el); };
    return { el, check: () => { if (picked == null) return null; UI.lockChoices(list, ex.answer, picked); showRun(); return { correct: picked === ex.answer, answer: picked, message: picked === ex.answer ? 'Correct prediction.' : `Not quite. The answer is ${ex.answer + 1}. Step through the stages below to see why.` }; }, reveal: () => { UI.lockChoices(list, ex.answer, picked); showRun(); } };
  };

  R.bug = (ex, ctx) => {
    let picked = null;
    const code = UI.code(ex.query, { onLineClick: (i, el) => { picked = i; [...code.children].forEach((l, j) => l.classList.toggle('selected', j === i)); ctx.setCanCheck(true); } });
    const after = h('div');
    const el = h('div', null, UI.rich(ex.prompt || 'This query has one bug. Click the line that contains it.', 'p'), code, after);
    const reveal = () => {
      [...code.children].forEach((l, j) => { l.classList.toggle('bugline', j === ex.bugLine); l.classList.remove('clickable'); });
      after.innerHTML = '';
      const run = UI.runBox(ex.query, { trace: false });
      after.append(h('div', { class: 'label' }, 'What the buggy query does'), run.el, h('div', { class: 'label' }, 'Fixed query'), UI.code(ex.fix), h('button', { class: 'btn ghost small', type: 'button', onClick: (e) => { e.target.replaceWith(UI.runBox(ex.fix, { trace: false }).el); } }, UI.icon('play'), ' Run the fix'));
    };
    return { el, check: () => { if (picked == null) return null; reveal(); return { correct: picked === ex.bugLine, answer: picked, message: picked === ex.bugLine ? 'You found it.' : `Not that line. The bug is on line ${ex.bugLine + 1}.` }; }, reveal };
  };

  R.parsons = (ex, ctx) => {
    const solLines = ex.solution.split('\n').filter((l) => l.trim());
    const pool = XQL.shuffle(solLines.concat(ex.distractors || []).map((text, i) => ({ text, id: i, distractor: i >= solLines.length })));
    const avail = h('div', { class: 'plist' });
    const answer = h('div', { class: 'plist answer' });
    let placed = [];
    function render() {
      avail.innerHTML = ''; answer.innerHTML = '';
      for (const it of pool) if (!placed.includes(it)) avail.append(h('div', { class: 'pline', onClick: () => { placed.push(it); render(); } }, h('pre', { class: 'xql inline', html: UI.highlight(it.text) }), h('span', { class: 'ico' }, '→')));
      placed.forEach((it, i) => answer.append(h('div', { class: 'pline' }, h('pre', { class: 'xql inline', html: UI.highlight(it.text) }), h('span', { class: 'pbtns' },
        h('button', { class: 'mini', type: 'button', title: 'Move up', disabled: i === 0, onClick: () => { [placed[i - 1], placed[i]] = [placed[i], placed[i - 1]]; render(); } }, '↑'),
        h('button', { class: 'mini', type: 'button', title: 'Move down', disabled: i === placed.length - 1, onClick: () => { [placed[i + 1], placed[i]] = [placed[i], placed[i + 1]]; render(); } }, '↓'),
        h('button', { class: 'mini', type: 'button', title: 'Remove', onClick: () => { placed = placed.filter((p) => p !== it); render(); } }, '✕')))));
      if (!placed.length) answer.append(h('div', { class: 'empty' }, 'Click the available lines to add them here in order, then fix the order with the arrows.'));
      ctx.setCanCheck(placed.length > 0);
    }
    render();
    const after = h('div');
    const el = h('div', null, UI.rich(ex.task, 'p'), h('div', { class: 'parsons' }, h('div', null, h('div', { class: 'label' }, 'Available lines'), avail), h('div', null, h('div', { class: 'label' }, 'Your query'), answer)), after);
    const assembled = () => placed.map((p) => p.text).join('\n');
    return {
      el,
      check: () => {
        if (!placed.length) return null;
        const q = assembled();
        after.innerHTML = '';
        let res;
        try { res = XQL.run(q); } catch (e) { after.append(UI.errorBox(e, q)); return { correct: false, message: 'That order does not run. Read the error, then fix the order.' }; }
        const expected = XQL.run(ex.solution);
        const cmp = XQL.compareResults(expected, res, { ordered: XQL.isOrdered(expected.ast) });
        const usedDistractor = placed.some((p) => p.distractor);
        after.append(UI.table(res, { max: 15 }));
        if (cmp.ok && !usedDistractor) return { correct: true, answer: q, message: 'Correct order: the query returns the expected result.' };
        if (cmp.ok) return { correct: true, hard: true, answer: q, message: `The result is right, but a line you included was not needed: ${placed.find((p) => p.distractor).text}` };
        return { correct: false, message: `The query runs but ${cmp.reason}` };
      },
      reveal: () => { after.innerHTML = ''; after.append(h('div', { class: 'label' }, 'Solution'), UI.code(ex.solution)); },
    };
  };

  R.cloze = (ex, ctx) => {
    const inputs = [];
    const parts = ex.template.split('___');
    const pre = h('pre', { class: 'xql cloze' });
    parts.forEach((p, i) => {
      pre.append(h('span', { html: UI.highlight(p) }));
      if (i < parts.length - 1) {
        const canonical = (ex.answers[i] || [''])[0];
        const inp = h('input', { class: 'blank', type: 'text', spellcheck: 'false', autocomplete: 'off', style: `width:${Math.max(6, canonical.length + 3)}ch`, 'aria-label': `blank ${i + 1}` });
        inp.addEventListener('input', () => ctx.setCanCheck(inputs.some((x) => x.value.trim())));
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ctx.requestCheck(); } });
        inputs.push(inp);
        pre.append(inp);
      }
    });
    const after = h('div');
    const el = h('div', null, UI.rich(ex.task, 'p'), pre, h('div', { class: 'muted small' }, 'Fill the blanks, then Check. Press Enter in a blank to check.'), after);
    const filled = () => { let i = 0; return ex.template.replace(/___/g, () => inputs[i++].value.trim()); };
    const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    return {
      el,
      check: () => {
        if (!inputs.some((x) => x.value.trim())) return null;
        const q = filled();
        after.innerHTML = '';
        inputs.forEach((inp, i) => { const ok = (ex.answers[i] || []).some((a) => norm(a) === norm(inp.value)); inp.classList.toggle('ok', ok); inp.classList.toggle('bad', !ok); });
        let res;
        try { res = XQL.run(q); } catch (e) { after.append(UI.errorBox(e, q)); return { correct: false, message: 'The filled-in query does not run. Fix the blanks marked in red.' }; }
        const expected = XQL.run(ex.solution);
        const cmp = XQL.compareResults(expected, res, { ordered: XQL.isOrdered(expected.ast) });
        after.append(UI.table(res, { max: 15 }));
        if (cmp.ok) { inputs.forEach((inp) => { inp.classList.remove('bad'); inp.classList.add('ok'); }); return { correct: true, answer: q, message: 'Correct: the query returns the expected result.' }; }
        return { correct: false, message: `The query runs but ${cmp.reason} Blanks marked in red differ from the expected answer.` };
      },
      reveal: () => { inputs.forEach((inp, i) => { inp.value = (ex.answers[i] || [''])[0]; inp.classList.add('ok'); inp.classList.remove('bad'); }); after.innerHTML = ''; after.append(h('div', { class: 'label' }, 'Solution'), UI.code(ex.solution)); },
    };
  };

  R.write = (ex, ctx) => {
    const after = h('div');
    const hintsBox = h('div', { class: 'hints' });
    let hintsUsed = 0;
    const ta = UI.editor({ rows: 7, onRun: () => ctx.requestCheck(), placeholder: 'dataset = xdr_data\n| filter ...\n| fields ...' });
    ta.addEventListener('input', () => ctx.setCanCheck(ta.value.trim().length > 0));
    const hintBtn = h('button', { class: 'btn ghost small', type: 'button' }, UI.icon('hint'), ' Hint');
    hintBtn.addEventListener('click', () => {
      const hs = ex.hints || [];
      if (hintsUsed >= hs.length) return;
      const t = hs[hintsUsed++];
      hintsBox.append(h('div', { class: 'hint' }, h('b', null, `Hint ${hintsUsed}: `), UI.rich(t)));
      ctx.noteHint();
      if (hintsUsed >= hs.length) hintBtn.disabled = true;
    });
    const runBtn = h('button', { class: 'btn ghost small', type: 'button' }, UI.icon('play'), ' Run (no grading)');
    runBtn.addEventListener('click', () => { after.innerHTML = ''; after.append(UI.runBox(ta.value).el); });
    const el = h('div', null, UI.rich(ex.task, 'p'), ta, h('div', { class: 'tools' }, runBtn, hintBtn, ctx.dataPeekButton(), h('span', { class: 'muted small' }, 'Ctrl/Cmd+Enter checks')), hintsBox, after);
    return {
      el,
      focus: () => ta.focus(),
      check: () => {
        const q = ta.value.trim();
        if (!q) return null;
        after.innerHTML = '';
        let res;
        try { res = XQL.run(q); } catch (e) { after.append(UI.errorBox(e, q)); return { correct: false, retry: true, message: 'Your query does not run yet. Read the error and try again.' }; }
        const expected = XQL.run(ex.solution);
        const ordered = XQL.isOrdered(expected.ast);
        const cmp = XQL.compareResults(expected, res, { ordered });
        const both = h('div', { class: 'compare' }, h('div', null, h('div', { class: 'label' }, 'Your result'), UI.table(res, { max: 12 })), h('div', null, h('div', { class: 'label' }, 'Expected result'), UI.table(expected, { max: 12 })));
        if (cmp.ok) { after.append(h('div', { class: 'label' }, 'Your result'), UI.table(res, { max: 12 })); return { correct: true, answer: q, message: `Correct: ${res.rows.length} row${res.rows.length === 1 ? '' : 's'}, matching the expected result${ordered ? ' in the right order' : ''}.` }; }
        after.append(both);
        let tip = '';
        if (cmp.kind === 'columns') tip = ' Use a fields stage (or comp aliases) so the output has exactly the requested columns.';
        if (cmp.kind === 'rows' && res.rows.length > expected.rows.length) tip = ' You have too many rows: a filter condition is probably missing or too loose.';
        if (cmp.kind === 'rows' && res.rows.length < expected.rows.length) tip = ' You have too few rows: a condition may be too strict, or a comparison with a null field is dropping rows.';
        return { correct: false, retry: true, message: `Not yet. ${cmp.reason}${tip}` };
      },
      reveal: () => { after.innerHTML = ''; after.append(h('div', { class: 'label' }, 'Model solution'), UI.code(ex.solution), UI.runBox(ex.solution, { trace: false }).el); },
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
