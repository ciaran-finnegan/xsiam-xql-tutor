// XQL Tutor - application controller: routing, learning path, review sessions, sandbox, reference, progress
(function (root) {
  const XQL = root.XQL;
  const UI = XQL.UI;
  const h = UI.h;
  const App = (XQL.App = {});

  App.srs = new XQL.SRS();
  App.exercises = (XQL.EXERCISES || []).slice().sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  App.concepts = XQL.CONCEPTS.slice().sort((a, b) => a.order - b.order);
  App.byConcept = (id) => App.exercises.filter((e) => e.concept === id);
  App.session = null;
  const TYPE_LABEL = { concept: 'Worked example', mcq: 'Quiz', predict: 'Predict the output', bug: 'Spot the bug', parsons: 'Order the stages', cloze: 'Fill the blanks', write: 'Write the query' };
  const TYPE_VERB = { concept: 'read', mcq: 'read', predict: 'read', bug: 'read', parsons: 'write', cloze: 'write', write: 'write' };
  App.TYPE_LABEL = TYPE_LABEL;

  const $app = () => document.getElementById('app');
  function setView(el) { const a = $app(); a.innerHTML = ''; a.append(el); window.scrollTo({ top: 0 }); }

  // ---- routing ------------------------------------------------------------------------------
  function route() {
    const hash = location.hash.replace(/^#\/?/, '') || 'learn';
    const [path, query] = hash.split('?');
    const [view, arg] = path.split('/');
    document.querySelectorAll('nav a[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
    App.updateNavStats();
    switch (view) {
      case 'learn': return arg ? App.viewUnit(arg) : App.viewLearn();
      case 'review': return App.viewReview();
      case 'session': return App.session ? App.showExercise(App.session.index) : App.viewLearn();
      case 'ex': { const ex = App.exercises.find((e) => e.id === arg); if (!ex) return App.viewLearn(); App.startSession([ex], { mode: 'single' }); return; }
      case 'sandbox': return App.viewSandbox(arg ? decodeURIComponent(arg) : null);
      case 'reference': return App.viewReference(arg);
      case 'progress': return App.viewProgress();
      case 'leaderboard': return App.viewLeaderboard ? App.viewLeaderboard() : App.viewLearn();
      case 'account': return App.viewAccount ? App.viewAccount(arg, query) : App.viewLearn();
      default: return App.viewLearn();
    }
  }
  App.go = (hash) => { if (location.hash === '#' + hash) route(); else location.hash = hash; };
  App.setView = setView;
  App.stat = stat;
  App.updateNavStats = () => {
    const s = App.srs.stats(App.exercises);
    const el = document.getElementById('navstats');
    if (el) el.innerHTML = `<span title="cards due for review">${s.due} due</span><span title="day streak">🔥 ${s.streak}</span>`;
    const badge = document.getElementById('duebadge');
    if (badge) { badge.textContent = s.due; badge.classList.toggle('hidden', !s.due); }
  };

  // ---- learn view ------------------------------------------------------------------------------
  App.viewLearn = () => {
    const s = App.srs.stats(App.exercises);
    const strip = h('div', { class: 'strip' },
      stat('Cards mastered', `${s.mastered} / ${s.total}`), stat('Due for review', s.due), stat('Answered today', s.todayCount), stat('Day streak', s.streak), stat('Recent accuracy', s.accuracy == null ? '–' : Math.round(s.accuracy * 100) + '%'));
    const next = App.nextLearnTarget();
    const hero = h('section', { class: 'hero' },
      h('div', null, h('h1', null, 'Learn Cortex XQL by reading and writing queries'), h('p', { class: 'lead' }, `${App.concepts.length} short units: the language first, then the log sources a real SOC hunts in, on a fictional company's data (NGFW and Prisma Access, AWS CloudTrail and VPC flows, Azure and Entra ID, GitHub, Snowflake, alerts and the Cortex Data Model). Each unit moves from an annotated worked example, to predicting output, to spotting bugs and ordering stages, to writing queries that are graded by running them against sample data. Cards you struggle with come back sooner.`)),
      h('div', { class: 'heroactions' },
        next ? h('button', { class: 'btn primary big', type: 'button', onClick: () => App.startUnit(next.concept.id, next.index) }, UI.icon('bolt'), ` ${s.seen ? 'Continue' : 'Start'}: ${next.concept.title}`) : App.exercises.length ? h('div', { class: 'done' }, 'You have worked through every card. Keep reviewing to retain it.') : h('div', { class: 'muted' }, 'No exercise files loaded. Check that js/content/exercises-*.js exist.'),
        s.due ? h('button', { class: 'btn', type: 'button', onClick: () => App.go('review') }, `Review ${s.due} due card${s.due === 1 ? '' : 's'}`) : null));
    const grid = h('div', { class: 'units' }, App.concepts.map((c, i) => {
      const exs = App.byConcept(c.id);
      const m = App.srs.conceptMastery(exs);
      const seen = exs.filter((e) => App.srs.card(e.id)).length;
      const due = exs.filter((e) => App.srs.isDue(e.id)).length;
      return h('div', { class: 'unit' + (m >= 0.8 ? ' mastered' : ''), onClick: () => App.go('learn/' + c.id) },
        h('div', { class: 'unithead' }, h('span', { class: 'num' }, i + 1), h('h3', null, c.title), due ? h('span', { class: 'chip warn' }, `${due} due`) : null),
        h('p', null, c.blurb),
        h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${Math.round(m * 100)}%` })),
        h('div', { class: 'unitfoot' }, h('span', null, `${seen}/${exs.length} cards seen`), h('span', null, `${Math.round(m * 100)}% mastery`)));
    }));
    setView(h('div', null, hero, strip, h('h2', null, 'Learning path'), grid));
  };
  function stat(label, value) { return h('div', { class: 'stat' }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label)); }

  App.nextLearnTarget = () => {
    for (const c of App.concepts) {
      const exs = App.byConcept(c.id);
      const idx = exs.findIndex((e) => !App.srs.card(e.id) || App.srs.card(e.id).lastGrade === 'again');
      if (idx >= 0) return { concept: c, index: idx };
    }
    return null;
  };

  App.viewUnit = (id) => {
    const c = App.concepts.find((x) => x.id === id);
    if (!c) return App.viewLearn();
    const exs = App.byConcept(id);
    const list = h('ol', { class: 'exlist' }, exs.map((e, i) => {
      const card = App.srs.card(e.id);
      const st = !card ? 'new' : App.srs.isDue(e.id) ? 'due' : card.lastGrade === 'again' ? 'again' : App.srs.strength(e.id) >= 0.8 ? 'mastered' : 'learning';
      return h('li', { class: 'exrow ' + st, onClick: () => App.startUnit(id, i) },
        h('span', { class: 'status', title: st }), h('span', { class: 'extitle' }, e.title), h('span', { class: 'chip ' + TYPE_VERB[e.type] }, TYPE_LABEL[e.type]), h('span', { class: 'diff', title: `difficulty ${e.difficulty}` }, '●'.repeat(e.difficulty) + '○'.repeat(5 - e.difficulty)));
    }));
    const m = App.srs.conceptMastery(exs);
    setView(h('div', null,
      h('a', { href: '#learn', class: 'back' }, '← All units'),
      h('h1', null, `${c.order}. ${c.title}`), h('p', { class: 'lead' }, c.blurb),
      h('div', { class: 'bar wide' }, h('div', { class: 'fill', style: `width:${Math.round(m * 100)}%` })),
      h('div', { class: 'twocol' },
        h('div', null, h('h3', null, 'Key points'), h('ul', { class: 'points' }, c.keyPoints.map((p) => h('li', null, UI.rich(p)))), h('h3', null, 'Vendor reference'), h('ul', { class: 'docs' }, c.docs.map((d) => h('li', null, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.title, ' ', UI.icon('link')))))),
        h('div', null, h('h3', null, `Cards (${exs.length})`), exs.length ? list : h('p', { class: 'muted' }, 'No exercises for this unit yet.'), exs.length ? h('button', { class: 'btn primary', type: 'button', onClick: () => App.startUnit(id, Math.max(0, exs.findIndex((e) => !App.srs.card(e.id) || App.srs.card(e.id).lastGrade === 'again'))) }, UI.icon('bolt'), ' Study this unit') : null))));
  };

  App.startUnit = (conceptId, startIndex) => {
    const exs = App.byConcept(conceptId);
    App.startSession(exs, { mode: 'unit', concept: conceptId, start: startIndex || 0 });
  };

  // ---- review view ------------------------------------------------------------------------------
  App.viewReview = () => {
    const s = App.srs.stats(App.exercises);
    const settings = App.srs.state.settings;
    const next = App.srs.nextDueAt();
    const seenCards = App.exercises.filter((e) => App.srs.card(e.id));
    const el = h('div', null,
      h('h1', null, 'Review'), h('p', { class: 'lead' }, 'Spaced, interleaved retrieval practice. Cards come back when you are about to forget them, mixed across units so you have to decide which tool fits.'),
      h('div', { class: 'strip' }, stat('Due now', s.due), stat('Seen', `${s.seen} / ${s.total}`), stat('Next due', next ? relTime(next) : '–')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary big', type: 'button', disabled: !s.due && !App.exercises.some((e) => !App.srs.card(e.id)), onClick: () => { const list = App.srs.buildSession(App.exercises); if (list.length) App.startSession(list, { mode: 'review' }); } }, UI.icon('bolt'), s.due ? ` Review ${Math.min(s.due, settings.reviewLimit)} due + ${settings.newPerSession} new` : ` Learn ${settings.newPerSession} new cards`),
        seenCards.length ? h('button', { class: 'btn', type: 'button', onClick: () => App.startSession(XQL.interleave(XQL.shuffle(seenCards.slice())).slice(0, 10), { mode: 'practice' }) }, 'Practice 10 random seen cards') : null,
        h('button', { class: 'btn', type: 'button', onClick: () => { const w = App.exercises.filter((e) => e.type === 'write' && App.srs.card(e.id)); if (w.length) App.startSession(XQL.shuffle(w.slice()).slice(0, 6), { mode: 'practice' }); else alert('No write exercises seen yet: work through a unit first.'); } }, 'Drill 6 write exercises')),
      h('h3', null, 'Session settings'),
      h('div', { class: 'settings' },
        settingRow('New cards per review session', 'newPerSession', [0, 3, 6, 10]),
        settingRow('Max due cards per session', 'reviewLimit', [8, 14, 20, 40])));
    setView(el);
    function settingRow(label, key, options) {
      return h('label', { class: 'setting' }, label, h('select', { onChange: (e) => { App.srs.setSetting(key, Number(e.target.value)); App.viewReview(); } }, options.map((o) => h('option', { value: o, selected: settings[key] === o }, o))));
    }
  };
  function relTime(ts) { const d = ts - Date.now(); if (d < 60000) return 'now'; if (d < 3600000) return `in ${Math.round(d / 60000)} min`; if (d < 86400000) return `in ${Math.round(d / 3600000)} h`; return `in ${Math.round(d / 86400000)} d`; }

  // ---- exercise sessions ------------------------------------------------------------------------------
  App.startSession = (list, opts) => {
    App.session = { list, index: opts.start || 0, mode: opts.mode, concept: opts.concept, results: [] };
    App.go('session');
  };

  App.showExercise = (index) => {
    const ses = App.session;
    if (!ses || index >= ses.list.length) return App.endSession();
    ses.index = index;
    const ex = ses.list[index];
    const concept = App.concepts.find((c) => c.id === ex.concept);
    let attempts = 0, hints = 0, finished = false, canCheck = false, outcome = null;
    const feedback = h('div', { class: 'feedback' });
    const checkBtn = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Check');
    const revealBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Show solution');
    const nextBtn = h('button', { class: 'btn', type: 'button', style: 'display:none' }, index + 1 < ses.list.length ? 'Next →' : 'Finish');
    const skipBtn = h('button', { class: 'btn ghost small', type: 'button', title: 'Skip without grading' }, 'Skip');
    const ctx = {
      setCanCheck: (v) => { canCheck = v; checkBtn.disabled = !v || finished; },
      requestCheck: () => { if (!checkBtn.disabled) checkBtn.click(); },
      noteHint: () => { hints++; },
      dataPeekButton: () => h('button', { class: 'btn ghost small', type: 'button', onClick: () => App.openDataPeek(ex) }, UI.icon('book'), ' Browse the sample data'),
    };
    const r = UI.renderers[ex.type](ex, ctx);
    const gradeBox = h('div', { class: 'grades' });
    function finish(out, revealed) {
      finished = true; outcome = out;
      checkBtn.disabled = true; revealBtn.disabled = true;
      let suggested = 'good';
      if (!out.correct || revealed) suggested = 'again';
      else if (out.hard || hints > 0 || attempts > 1) suggested = 'hard';
      gradeBox.innerHTML = '';
      gradeBox.append(h('span', { class: 'muted small' }, 'How did that feel? (sets when this card returns)'),
        ...[['again', 'Again', '10 min'], ['hard', 'Hard', '1-2 d'], ['good', 'Good', '1-3 d'], ['easy', 'Easy', '3-7 d']].map(([g, label, when]) => h('button', { class: 'btn grade ' + g + (g === suggested ? ' suggested' : ''), type: 'button', onClick: () => grade(g) }, label, h('small', null, when))));
      nextBtn.style.display = '';
      nextBtn.onclick = () => grade(suggested);
      App.session.suggested = suggested;
    }
    function grade(g) {
      if (!App.session || App.session.graded === ex.id) return;
      App.session.graded = ex.id;
      App.srs.grade(ex.id, g, { correct: outcome && outcome.correct, type: ex.type, concept: ex.concept });
      ses.results.push({ id: ex.id, correct: outcome && outcome.correct, grade: g });
      App.updateNavStats();
      App.showExercise(index + 1);
    }
    checkBtn.addEventListener('click', () => {
      if (finished) return;
      const out = r.check();
      if (!out) return;
      attempts++;
      feedback.innerHTML = '';
      feedback.append(h('div', { class: 'verdict ' + (out.correct ? 'ok' : 'bad') }, UI.icon(out.correct ? 'check' : 'cross'), ' ', out.message));
      if (out.correct || !out.retry) {
        feedback.append(h('div', { class: 'explain' }, h('div', { class: 'label' }, 'Why'), UI.rich(ex.explanation, 'div'), ex.docs && ex.docs.length ? h('div', { class: 'doclinks' }, 'Reference: ', ex.docs.map((d, i) => [i ? ' · ' : '', h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.title, ' ', UI.icon('link'))])) : null));
        finish(out, false);
        if (out.correct && App.account) App.account.submit(ex, out.answer);
      } else {
        feedback.append(h('div', { class: 'muted small' }, `Attempt ${attempts}. Edit your query and check again, or show the solution.`));
      }
    });
    revealBtn.addEventListener('click', () => {
      if (finished) return;
      r.reveal();
      feedback.innerHTML = '';
      feedback.append(h('div', { class: 'verdict bad' }, 'Solution shown. This card will come back soon.'), h('div', { class: 'explain' }, h('div', { class: 'label' }, 'Why'), UI.rich(ex.explanation, 'div'), ex.docs && ex.docs.length ? h('div', { class: 'doclinks' }, 'Reference: ', ex.docs.map((d, i) => [i ? ' · ' : '', h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.title, ' ', UI.icon('link'))])) : null));
      finish({ correct: false }, true);
    });
    skipBtn.addEventListener('click', () => App.showExercise(index + 1));
    const modeLabel = ses.mode === 'review' ? 'Review session' : ses.mode === 'practice' ? 'Practice' : ses.mode === 'single' ? 'Card' : concept ? `Unit ${concept.order}: ${concept.title}` : 'Session';
    const head = h('div', { class: 'exhead' },
      h('div', { class: 'crumbs' }, h('a', { href: ses.concept ? '#learn/' + ses.concept : ses.mode === 'review' ? '#review' : '#learn' }, '← ', modeLabel), h('span', { class: 'progress' }, `${index + 1} / ${ses.list.length}`)),
      h('div', { class: 'progressbar' }, h('div', { class: 'fill', style: `width:${Math.round((index / ses.list.length) * 100)}%` })),
      h('div', { class: 'exmeta' }, h('span', { class: 'chip ' + TYPE_VERB[ex.type] }, TYPE_LABEL[ex.type]), concept && ses.mode !== 'unit' ? h('span', { class: 'chip' }, concept.title) : null, h('span', { class: 'diff', title: `difficulty ${ex.difficulty}` }, '●'.repeat(ex.difficulty) + '○'.repeat(5 - ex.difficulty))),
      h('h2', null, ex.title));
    const card = h('div', { class: 'excard' }, head, h('div', { class: 'exbody' }, r.el), h('div', { class: 'actions' }, checkBtn, revealBtn, h('button', { class: 'btn ghost small', type: 'button', onClick: () => App.loadInSandbox(exerciseQuery(ex)) }, 'Open in sandbox'), skipBtn), feedback, gradeBox, nextBtn);
    setView(card);
    if (r.focus) r.focus();
    App.keyHandler = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (finished && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nextBtn.click(); return; }
      if (!finished && e.key === 'Enter' && canCheck) { e.preventDefault(); checkBtn.click(); return; }
      if (!finished && /^[1-9]$/.test(e.key)) { const b = card.querySelectorAll('.choice')[Number(e.key) - 1]; if (b && !b.disabled) b.click(); }
      if (finished && /^[1-4]$/.test(e.key)) { const b = gradeBox.querySelectorAll('.grade')[Number(e.key) - 1]; if (b) b.click(); }
    };
  };
  function exerciseQuery(ex) { return ex.query || ex.solution || ex.fix || (ex.template ? ex.template.replace(/___/g, '') : 'dataset = xdr_data\n| limit 10'); }

  App.endSession = () => {
    const ses = App.session;
    App.session = null;
    const res = ses ? ses.results : [];
    const correct = res.filter((r) => r.correct).length;
    const s = App.srs.stats(App.exercises);
    setView(h('div', { class: 'summary' }, h('h1', null, 'Session complete'), h('p', { class: 'lead' }, res.length ? `${correct} of ${res.length} correct on the first check.` : 'Nothing graded.'),
      h('div', { class: 'strip' }, stat('Due now', s.due), stat('Mastered', `${s.mastered} / ${s.total}`), stat('Streak', s.streak)),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onClick: () => App.go('learn') }, 'Back to the learning path'), s.due ? h('button', { class: 'btn', type: 'button', onClick: () => { const list = App.srs.buildSession(App.exercises, { newPerSession: 0 }); if (list.length) App.startSession(list, { mode: 'review' }); } }, `Review ${s.due} due`) : null)));
  };

  // ---- data peek drawer ------------------------------------------------------------------------------
  App.openDataPeek = (ex) => {
    const names = Object.keys(XQL.DATASETS);
    const preferred = ex && /dataset\s*=\s*([a-z_]+)/i.exec(exerciseQuery(ex));
    let current = preferred && XQL.DATASETS[preferred[1].toLowerCase()] ? preferred[1].toLowerCase() : 'xdr_data';
    const body = h('div', { class: 'peekbody' });
    const tabs = h('div', { class: 'tabs' });
    let evFilter = ''; // event-type filter for xdr_data; declared before render() uses it
    function render() {
      tabs.innerHTML = ''; body.innerHTML = '';
      names.forEach((n) => tabs.append(h('button', { class: 'tab' + (n === current ? ' active' : ''), type: 'button', onClick: () => { current = n; evFilter = ''; render(); } }, n)));
      const ds = XQL.DATASETS[current];
      const filterSel = current === 'xdr_data' ? h('select', { onChange: (e) => { evFilter = e.target.value; renderTable(); } }, [['', 'all event types'], ['1', 'PROCESS'], ['2', 'NETWORK'], ['3', 'FILE'], ['4', 'REGISTRY'], ['6', 'LOAD_IMAGE']].map(([v, l]) => h('option', { value: v, selected: evFilter === v }, l))) : null;
      const tbl = h('div');
      function renderTable() {
        const rows = evFilter ? ds.rows.filter((r) => String(r.event_type) === evFilter) : ds.rows;
        const cols = ds.columns.filter((c) => rows.some((r) => r[c] != null)); // sparse schemas: hide columns that are empty for the selection
        tbl.innerHTML = ''; tbl.append(UI.table({ columns: cols, rows }, { max: 100 }));
      }
      renderTable();
      body.append(h('p', { class: 'muted' }, ds.description, ` ${ds.rows.length} rows. The sandbox clock is frozen at ${XQL.formatTime(XQL.NOW)}. Columns that are empty for every shown row are hidden.`), filterSel ? h('div', { class: 'tools' }, 'Show: ', filterSel) : null, tbl,
        h('details', null, h('summary', null, 'Field descriptions'), h('dl', { class: 'fields' }, ds.columns.map((c) => [h('dt', null, c), h('dd', null, (ds.fieldDocs && ds.fieldDocs[c]) || '')]))));
    }
    render();
    App.modal(h('div', null, h('h2', null, 'Sample data'), tabs, body));
  };

  App.modal = (content) => {
    const close = () => overlay.remove();
    const overlay = h('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) close(); } }, h('div', { class: 'modal' }, h('button', { class: 'close', type: 'button', onClick: close, 'aria-label': 'Close' }, '✕'), content));
    document.body.append(overlay);
    const esc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
  };

  // ---- sandbox ------------------------------------------------------------------------------
  const EXAMPLES = [
    ['Processes per host', 'dataset = xdr_data\n| filter event_type = ENUM.PROCESS\n| comp count() as processes, count_distinct(action_process_image_name) as distinct_images by agent_hostname\n| sort desc processes'],
    ['Office spawning PowerShell', 'config timeframe = 7d\n| dataset = xdr_data\n| filter event_type = ENUM.PROCESS\n    and action_process_image_name in ("powershell.exe", "pwsh.exe")\n    and actor_process_image_name in ("WINWORD.EXE", "EXCEL.EXE", "OUTLOOK.EXE")\n| fields _time, agent_hostname, actor_effective_username, actor_process_image_name, action_process_image_command_line\n| sort desc _time'],
    ['Rare binaries across the fleet', 'dataset = xdr_data\n| filter event_type = ENUM.PROCESS and action_process_image_sha256 != null\n| comp count_distinct(agent_hostname) as host_count, min(_time) as first_seen by action_process_image_sha256, action_process_image_name\n| filter host_count <= 1\n| sort asc first_seen'],
    ['External connections per hour', 'dataset = xdr_data\n| filter event_type = ENUM.NETWORK and action_remote_ip not incidr "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"\n| bin _time span = 1h\n| comp count() as connections, sum(action_total_upload) as bytes_out by _time, agent_hostname\n| sort desc bytes_out'],
    ['First PsExec per host', 'dataset = xdr_data\n| filter event_type = ENUM.PROCESS and action_process_image_name = "PsExec.exe"\n| fields _time, agent_hostname, actor_effective_username, action_process_image_command_line\n| dedup agent_hostname by asc _time\n| sort asc _time'],
    ['IOC hash match via sub-query', 'dataset = xdr_data\n| filter action_process_image_sha256 in (dataset = ioc_hashes | fields sha256)\n   or action_file_sha256 in (dataset = ioc_hashes | fields sha256)\n| fields _time, agent_hostname, event_type, action_process_image_name, action_file_path'],
    ['Join to high-value assets', 'dataset = xdr_data\n| filter event_type = ENUM.PROCESS\n| fields _time, agent_hostname, action_process_image_name\n| join type = inner (dataset = hva_hosts | fields hostname, owner, tier) as hva hva.hostname = agent_hostname\n| comp count() as events by tier, owner\n| sort asc tier'],
    ['Failed logons from Windows logs', 'dataset = microsoft_windows_raw\n| filter event_id = 4625\n| alter user = json_extract_scalar(event_data, "$.TargetUserName"), src_ip = event_data -> IpAddress, workstation = event_data -> WorkstationName\n| comp count() as failures, min(_time) as first_fail, max(_time) as last_fail by user, src_ip, workstation\n| sort desc failures'],
    ['Firewall: big uploads', 'dataset = panw_ngfw_traffic_raw\n| filter action = "allow" and bytes_sent > 1000000\n| alter mb_sent = round(divide(bytes_sent, 1048576))\n| fields _time, source_ip, dest_ip, dest_port, app, rule_matched, mb_sent\n| sort desc mb_sent'],
    ['Top destinations with GeoIP', 'dataset = xdr_data\n| filter event_type = ENUM.NETWORK and action_country != null\n| iploc action_remote_ip loc_country as country, loc_city as city\n| top 5 action_remote_ip\n| sort desc TOP_COUNT'],
    ['NGFW: threats that were only alerted', 'dataset = panw_ngfw_threat_raw\n| filter severity in ("high", "critical") and action = "alert"\n| fields _time, source_ip, dest_ip, dest_port, threat_name, threat_category, rule_matched, log_source_name\n| sort desc _time'],
    ['GlobalProtect: failed VPN logins by user and country', 'dataset = panw_ngfw_globalprotect_raw\n| filter event_id = "portal-auth" and status = "failure"\n| comp count() as failures, values(public_ip) as sources, max(_time) as last_seen by source_user, source_region, auth_method\n| sort desc failures'],
    ['Prisma Access: what a VPN session reached', 'dataset = panw_ngfw_traffic_raw\n| filter is_prisma_mobile = true\n| fields _time, source_user, source_ip, dest_ip, dest_port, app, action, bytes_sent\n| join type = left (dataset = panw_ngfw_globalprotect_raw | filter event_id = "gateway-connected" | fields private_ip, public_ip, source_region) as gp gp.private_ip = source_ip\n| sort asc _time'],
    ['CloudTrail: everything done with the stolen key', 'dataset = amazon_aws_raw\n| filter _log_type = "cloudtrail" and sourceIPAddress = "192.0.2.77"\n| alter identity = userIdentity -> type, who = coalesce(userIdentity -> userName, userIdentity -> type)\n| fields _time, awsRegion, eventSource, eventName, who, errorCode, userAgent\n| sort asc _time'],
    ['CloudTrail: console logins and MFA', 'dataset = amazon_aws_raw\n| filter _log_type = "cloudtrail" and eventName = "ConsoleLogin"\n| alter who = coalesce(userIdentity -> userName, userIdentity -> type), result = responseElements -> ConsoleLogin, mfa = additionalEventData -> MFAUsed\n| fields _time, recipientAccountId, who, sourceIPAddress, result, mfa\n| sort asc _time'],
    ['VPC flow logs: scanner against the ALB (requests only)', 'dataset = amazon_aws_raw\n| filter _log_type = "flowlogs" and dstaddr = "10.240.34.41"\n| comp count() as flows, values(dstport) as ports, sum(bytes) as bytes by srcaddr, action\n| sort desc flows'],
    ['Entra: sign-in failures by user and error code', 'dataset = msft_azure_ad_raw\n| alter code = to_integer(status -> errorCode), country = location -> countryOrRegion\n| filter code != 0\n| comp count() as failures, values(ipAddress) as sources, max(_time) as last_fail by userPrincipalName, code, country\n| sort desc failures'],
    ['Entra audit: directory changes without provisioning noise', 'dataset = msft_azure_ad_audit_raw\n| filter loggedByService != "Azure AD Cloud Sync"\n| alter by_user = initiatedBy -> user.userPrincipalName, by_app = initiatedBy -> app.displayName, from_ip = initiatedBy -> user.ipAddress\n| fields _time, activityDisplayName, category, result, by_user, by_app, from_ip\n| sort desc _time'],
    ['Azure NSG: dedup duplicate deliveries before counting', 'dataset = msft_azure_flowlogs_raw\n| dedup sourceAddress, destinationAddress, sourcePort, destinationPort, startTime\n| comp count() as flows, sum(bytesSent) as bytes_sent by sourceAddress, destinationAddress, destinationPort, deviceAction, nsgRuleName\n| sort desc bytes_sent'],
    ['Alerts: retroactive IOC alerts (arrays need to_string)', 'dataset = alerts\n| filter alert_source = "XDR_IOC"\n| alter lip = to_string(local_ip), rip = to_string(remote_ip), lag_hours = timestamp_diff(_time, event_timestamp, "HOUR")\n| comp count() as alerts, min(event_timestamp) as first_event, max(lag_hours) as max_lag_hours by alert_name, lip, rip\n| sort desc alerts'],
    ['Data model: failed logins for one user across every source', 'datamodel dataset = *\n| filter xdm.event.type = "AUTHENTICATION" and xdm.event.outcome = XDM_CONST.OUTCOME_FAILED\n    and lowercase(xdm.source.user.username) contains "s.hudson"\n| fields _time, _dataset, xdm.source.ipv4, xdm.source.location.country, xdm.auth.auth_method, xdm.target.resource.name, xdm.event.outcome_reason\n| sort asc _time'],
    ['Data model: one target IP across firewall, VPC and NSG flows', 'datamodel dataset in (panw_ngfw_traffic_raw, amazon_aws_raw, msft_azure_flowlogs_raw, xdr_data)\n| filter xdm.target.ipv4 = "192.0.2.45"\n| comp count() as flows, sum(xdm.source.sent_bytes) as bytes_out, values(xdm.source.ipv4) as sources by _dataset\n| sort desc bytes_out'],
  ];
  App.loadInSandbox = (q) => { App.go('sandbox/' + encodeURIComponent(q)); };
  App.viewSandbox = (initial) => {
    const out = h('div', { class: 'sandout' });
    const ta = UI.editor({ rows: 9, value: initial || App.sandboxText || EXAMPLES[0][1], onRun: () => run() });
    const run = () => { App.sandboxText = ta.value; out.innerHTML = ''; out.append(UI.runBox(ta.value, { max: 100 }).el); };
    const sel = h('select', { onChange: (e) => { if (e.target.value !== '') { ta.value = EXAMPLES[Number(e.target.value)][1]; run(); } } }, h('option', { value: '' }, 'Load an example query…'), EXAMPLES.map((ex, i) => h('option', { value: i }, ex[0])));
    const schema = h('div', { class: 'schema' });
    Object.entries(XQL.DATASETS).forEach(([name, ds]) => {
      schema.append(h('details', { open: name === 'xdr_data' ? '' : null }, h('summary', null, h('b', null, name), h('span', { class: 'muted small' }, ` ${ds.rows.length} rows · ${ds.kind}`)),
        h('p', { class: 'muted small' }, ds.description), h('ul', { class: 'fieldlist' }, ds.columns.map((c) => h('li', { title: (ds.fieldDocs && ds.fieldDocs[c]) || '', onClick: () => { insertAtCursor(ta, c); ta.focus(); } }, h('code', null, c), h('span', { class: 'muted small' }, ' ', (ds.fieldDocs && ds.fieldDocs[c]) || ''))))));
    });
    setView(h('div', { class: 'sandbox' },
      h('div', { class: 'sandmain' },
        h('h1', null, 'Sandbox'), h('p', { class: 'lead' }, `Write any query against the sample tenant. The clock is frozen at ${XQL.formatTime(XQL.NOW)} so config timeframe behaves consistently. Click a stage in the trace to see the rows after it.`),
        h('div', { class: 'tools' }, sel, h('button', { class: 'btn primary', type: 'button', onClick: run }, UI.icon('play'), ' Run (Ctrl/Cmd+Enter)'), h('button', { class: 'btn ghost', type: 'button', onClick: () => App.openDataPeek(null) }, UI.icon('book'), ' Browse data')),
        ta, out),
      h('aside', { class: 'sandside' }, h('h3', null, 'Datasets and fields'), h('p', { class: 'muted small' }, 'Click a field to insert it at the cursor.'), schema)));
    if (initial || App.sandboxText) run();
  };
  function insertAtCursor(ta, text) { const s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.slice(0, s) + text + ta.value.slice(e); ta.selectionStart = ta.selectionEnd = s + text.length; }

  // ---- reference ------------------------------------------------------------------------------
  App.viewReference = (tab) => {
    tab = tab || 'stages';
    const q = h('input', { type: 'search', placeholder: 'Filter…', class: 'search' });
    const list = h('div', { class: 'refgrid' });
    function render() {
      const term = q.value.trim().toLowerCase();
      list.innerHTML = '';
      const items = tab === 'stages' ? XQL.REFERENCE.stages : tab === 'functions' ? XQL.REFERENCE.functions : null;
      if (items) {
        items.filter((it) => !term || JSON.stringify(it).toLowerCase().includes(term)).forEach((it) => list.append(h('div', { class: 'refcard' },
          h('h3', null, it.name, ' ', h('a', { href: it.url, target: '_blank', rel: 'noopener', class: 'small', title: 'Vendor reference' }, UI.icon('link'))),
          h('code', { class: 'sig' }, it.syntax || it.sig), h('p', null, it.what), UI.code(it.example), it.notes ? h('p', { class: 'muted small' }, it.notes) : null,
          h('button', { class: 'btn ghost small', type: 'button', onClick: () => App.loadInSandbox(it.example.includes('dataset') || it.example.startsWith('config') ? it.example : 'dataset = xdr_data\n| ' + it.example) }, 'Try in sandbox'))));
      } else {
        App.concepts.forEach((c) => list.append(h('div', { class: 'refcard' }, h('h3', null, `${c.order}. ${c.title}`), h('ul', { class: 'points' }, c.keyPoints.map((p) => h('li', null, UI.rich(p)))), h('div', { class: 'doclinks' }, c.docs.map((d, i) => [i ? ' · ' : '', h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.title)])))));
      }
    }
    q.addEventListener('input', render);
    const tabs = h('div', { class: 'tabs' }, ['stages', 'functions', 'units'].map((t) => h('a', { href: '#reference/' + t, class: 'tab' + (t === tab ? ' active' : '') }, t[0].toUpperCase() + t.slice(1))));
    setView(h('div', null, h('h1', null, 'Reference'), h('p', { class: 'lead' }, 'Cheat-sheet cards distilled from the Cortex XQL command reference. Every card links to the vendor page.'), h('div', { class: 'tools' }, tabs, q), list));
    render();
  };

  // ---- progress / about ------------------------------------------------------------------------------
  App.viewProgress = () => {
    const s = App.srs.stats(App.exercises);
    const perType = {};
    for (const l of App.srs.state.log) { perType[l.type] = perType[l.type] || { n: 0, ok: 0 }; perType[l.type].n++; perType[l.type].ok += l.ok; }
    const file = h('input', { type: 'file', accept: 'application/json', style: 'display:none', onChange: (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { try { App.srs.importJSON(t); App.viewProgress(); } catch (err) { alert(err.message); } }); } });
    setView(h('div', null,
      h('h1', null, 'Progress'),
      h('div', { class: 'strip' }, stat('Mastered', `${s.mastered} / ${s.total}`), stat('Seen', s.seen), stat('Due', s.due), stat('Answers logged', s.answered), stat('Day streak', s.streak), stat('Recent accuracy', s.accuracy == null ? '–' : Math.round(s.accuracy * 100) + '%')),
      h('h3', null, 'By unit'),
      h('table', { class: 'grid units-table' }, h('thead', null, h('tr', null, h('th', null, 'Unit'), h('th', null, 'Mastery'), h('th', null, 'Seen'), h('th', null, 'Due'), h('th', null, 'Accuracy'))),
        h('tbody', null, App.concepts.map((c) => { const exs = App.byConcept(c.id); const m = App.srs.conceptMastery(exs); const logs = App.srs.state.log.filter((l) => l.concept === c.id); const acc = logs.length ? Math.round(100 * logs.filter((l) => l.ok).length / logs.length) + '%' : '–'; return h('tr', { onClick: () => App.go('learn/' + c.id), class: 'clickable' }, h('td', null, `${c.order}. ${c.title}`), h('td', null, h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${Math.round(m * 100)}%` }))), h('td', null, `${exs.filter((e) => App.srs.card(e.id)).length}/${exs.length}`), h('td', null, exs.filter((e) => App.srs.isDue(e.id)).length), h('td', null, acc)); }))),
      h('h3', null, 'By exercise type'),
      h('div', { class: 'strip' }, Object.keys(TYPE_LABEL).map((t) => stat(TYPE_LABEL[t], perType[t] ? `${Math.round(100 * perType[t].ok / perType[t].n)}% of ${perType[t].n}` : '–'))),
      h('h3', null, 'How this app teaches'),
      h('div', { class: 'methods' }, XQL.METHODS.map((m) => h('div', { class: 'method' }, h('h4', null, m.name), h('p', null, m.what), h('p', { class: 'muted small' }, m.why)))),
      h('h3', null, 'Sources reviewed'),
      h('ul', { class: 'docs' }, XQL.SOURCES.map((d) => h('li', null, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.title, ' ', UI.icon('link'))))),
      h('h3', null, 'Your data'),
      h('p', { class: 'muted' }, 'Progress is stored in this browser only (localStorage). Export it to move between machines.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: () => { const blob = new Blob([App.srs.exportJSON()], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: 'xql-tutor-progress.json' }); document.body.append(a); a.click(); a.remove(); } }, 'Export progress'), h('button', { class: 'btn', type: 'button', onClick: () => file.click() }, 'Import progress'), file, h('button', { class: 'btn danger', type: 'button', onClick: () => { if (confirm('Reset all progress? This cannot be undone.')) { App.srs.reset(); App.updateNavStats(); App.viewProgress(); } } }, 'Reset progress'))));
  };

  // ---- boot ------------------------------------------------------------------------------
  document.addEventListener('keydown', (e) => { if (App.keyHandler && location.hash.startsWith('#session')) App.keyHandler(e); });
  window.addEventListener('hashchange', () => { App.keyHandler = null; route(); });
  document.addEventListener('DOMContentLoaded', () => {
    const count = document.getElementById('cardcount');
    if (count) count.textContent = `${App.exercises.length} cards`;
    route();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
