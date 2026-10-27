// Loads the browser scripts into Node's globalThis so tests can use the same engine as the app.
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ENGINE = ['js/engine/lexer.js', 'js/engine/parser.js', 'js/engine/functions.js', 'js/data/datasets.js', 'js/engine/evaluator.js'];
const CONTENT = ['js/content/concepts.js', 'js/content/exercises-1.js', 'js/content/exercises-2.js', 'js/content/exercises-3.js'];

function load(files) {
  for (const f of files) {
    const p = path.join(ROOT, f);
    try { require(p); } catch (e) { if (e.code === 'MODULE_NOT_FOUND' && e.message.includes(f)) continue; throw e; }
  }
  return globalThis.XQL;
}

module.exports = { loadEngine: () => load(ENGINE), loadAll: () => load([...ENGINE, ...CONTENT]), ROOT };
