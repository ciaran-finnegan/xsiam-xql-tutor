// Validates every exercise against the engine: run with `node test/validate-exercises.js`
// Every reference solution must run, every "predict" answer must match what the engine returns,
// every "bug" must be a real bug, every cloze must be solvable, every parsons solution must run.
const { loadAll } = require('./load');
const XQL = loadAll();

const problems = [];
const warn = [];
const ex = XQL.EXERCISES || [];
const concepts = XQL.CONCEPTS || [];
const conceptIds = new Set(concepts.map((c) => c.id));
const ids = new Set();
const VALID_TYPES = ['concept', 'mcq', 'predict', 'bug', 'parsons', 'cloze', 'write'];

function tryRun(q) { try { return { res: XQL.run(q) }; } catch (e) { return { err: e }; } }
function checkMatches(res, check) {
  switch (check.kind) {
    case 'rowCount': return res.rows.length === check.value ? null : `rowCount is ${res.rows.length}, not ${check.value}`;
    case 'columns': { const got = res.columns.map((c) => c.toLowerCase()); const want = check.value.map((c) => c.toLowerCase()); return JSON.stringify(got) === JSON.stringify(want) ? null : `columns are [${res.columns.join(', ')}], not [${check.value.join(', ')}]`; }
    case 'cell': { const row = res.rows[check.row]; if (!row) return `row ${check.row} does not exist (only ${res.rows.length} rows)`; const k = Object.keys(row).find((x) => x.toLowerCase() === check.column.toLowerCase()); const v = k ? row[k] : undefined; const d = XQL.display(v); return d === String(check.value) ? null : `cell [${check.row}].${check.column} is ${d}, not ${check.value}`; }
    case 'values': { const k = res.columns.find((x) => x.toLowerCase() === check.column.toLowerCase()); if (!k) return `column ${check.column} missing`; const got = res.rows.map((r) => XQL.display(r[k])); const want = check.value.map(String); const g = check.ordered ? got : got.slice().sort(); const w = check.ordered ? want : want.slice().sort(); return JSON.stringify(g) === JSON.stringify(w) ? null : `values of ${check.column} are [${got.join(', ')}], not [${want.join(', ')}]`; }
    case 'error': return null;
    default: return `unknown check kind ${check.kind}`;
  }
}

for (const e of ex) {
  const where = `${e.id || '(no id)'} [${e.type}]`;
  const bad = (m) => problems.push(`${where}: ${m}`);
  if (!e.id) bad('missing id'); else if (ids.has(e.id)) bad('duplicate id'); else ids.add(e.id);
  if (!VALID_TYPES.includes(e.type)) { bad(`invalid type ${e.type}`); continue; }
  if (!conceptIds.has(e.concept)) bad(`unknown concept '${e.concept}'`);
  if (!e.title) bad('missing title');
  if (!e.explanation) bad('missing explanation');
  if (!(e.difficulty >= 1 && e.difficulty <= 5)) bad('difficulty must be 1-5');

  if (e.type === 'concept') {
    if (!e.query) bad('concept needs a query'); else { const r = tryRun(e.query); if (r.err) bad(`query fails: ${r.err.message}`); }
    if (!Array.isArray(e.notes) || !e.notes.length) bad('concept needs notes');
    if (!e.choices || e.answer == null) bad('concept needs a check question (choices + answer)');
  }
  if (e.type === 'mcq') {
    if (!Array.isArray(e.choices) || e.choices.length < 2) bad('mcq needs choices');
    if (!(e.answer >= 0 && e.answer < (e.choices || []).length)) bad('mcq answer index out of range');
    if (e.query) { const r = tryRun(e.query); if (r.err && !e.queryMayFail) bad(`query fails: ${r.err.message}`); }
  }
  if (e.type === 'predict') {
    if (!e.query) bad('predict needs a query');
    if (!e.check) bad('predict needs a check');
    if (!Array.isArray(e.choices) || e.choices.length < 2) bad('predict needs choices');
    if (!(e.answer >= 0 && e.answer < (e.choices || []).length)) bad('predict answer index out of range');
    if (e.query && e.check) {
      const r = tryRun(e.query);
      if (e.check.kind === 'error') { if (!r.err) bad('expected the query to fail but it ran'); }
      else if (r.err) bad(`query fails: ${r.err.message}`);
      else { const m = checkMatches(r.res, e.check); if (m) bad(`check does not match engine: ${m}`); }
    }
  }
  if (e.type === 'bug') {
    if (!e.query || !e.fix) bad('bug needs query and fix');
    else {
      const lines = e.query.split('\n');
      if (!(e.bugLine >= 0 && e.bugLine < lines.length)) bad(`bugLine ${e.bugLine} out of range (${lines.length} lines)`);
      const fixed = tryRun(e.fix);
      if (fixed.err) bad(`fix fails: ${fixed.err.message}`);
      const buggy = tryRun(e.query);
      if (e.expectError) { if (!buggy.err) bad('expectError is set but the buggy query runs without error'); }
      else if (!buggy.err && fixed.res) {
        const cmp = XQL.compareResults(fixed.res, buggy.res, { ordered: XQL.isOrdered(fixed.res.ast) });
        if (cmp.ok) bad('buggy query produces the same result as the fix, so it is not observably buggy (set expectError or change the data/query)');
      }
    }
  }
  if (e.type === 'parsons') {
    if (!e.solution) bad('parsons needs a solution');
    else {
      const r = tryRun(e.solution); if (r.err) bad(`solution fails: ${r.err.message}`);
      if (e.solution.split('\n').filter((l) => l.trim()).length < 3) bad('parsons solution should have at least 3 lines');
      for (const d of e.distractors || []) if (e.solution.split('\n').map((l) => l.trim()).includes(d.trim())) bad(`distractor "${d}" is also a solution line`);
    }
  }
  if (e.type === 'cloze') {
    if (!e.template || !e.solution || !Array.isArray(e.answers)) bad('cloze needs template, solution and answers');
    else {
      const blanks = (e.template.match(/___/g) || []).length;
      if (blanks !== e.answers.length) bad(`template has ${blanks} blanks but answers has ${e.answers.length} entries`);
      const sol = tryRun(e.solution); if (sol.err) bad(`solution fails: ${sol.err.message}`);
      let i = 0; const filled = e.template.replace(/___/g, () => (e.answers[i++] || [''])[0]);
      const r = tryRun(filled);
      if (r.err) bad(`template filled with the first answers fails: ${r.err.message}`);
      else if (sol.res) { const cmp = XQL.compareResults(sol.res, r.res, { ordered: XQL.isOrdered(sol.res.ast) }); if (!cmp.ok) bad(`filled template differs from solution: ${cmp.reason}`); }
      for (const alts of e.answers) if (!Array.isArray(alts) || !alts.length) bad('each answers entry must be a non-empty array of accepted strings');
    }
  }
  if (e.type === 'write') {
    if (!e.task || !e.solution) bad('write needs task and solution');
    else {
      const r = tryRun(e.solution);
      if (r.err) bad(`solution fails: ${r.err.message}`);
      else if (!r.res.rows.length && !e.allowEmpty) bad('solution returns no rows (set allowEmpty if intended)');
      if (!Array.isArray(e.hints) || e.hints.length < 2) warn.push(`${where}: write exercises should have at least 2 hints`);
    }
  }
}

// coverage report
const byConcept = {};
for (const e of ex) { byConcept[e.concept] = byConcept[e.concept] || {}; byConcept[e.concept][e.type] = (byConcept[e.concept][e.type] || 0) + 1; }
console.log(`exercises: ${ex.length} across ${Object.keys(byConcept).length} concepts`);
for (const c of concepts) {
  const t = byConcept[c.id] || {};
  console.log(`  ${c.id.padEnd(12)} ${VALID_TYPES.map((k) => `${k}:${t[k] || 0}`).join(' ')}`);
}
for (const w of warn) console.log('  warn: ' + w);
if (problems.length) { console.log(`\n${problems.length} problem(s):`); for (const p of problems) console.log('  - ' + p); process.exitCode = 1; }
else console.log('all exercises valid');
