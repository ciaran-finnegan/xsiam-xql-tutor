// XQL Tutor - lexer
// Turns XQL source text into tokens. Works in the browser (window.XQL) and in Node (globalThis.XQL).
(function (root) {
  const XQL = (root.XQL = root.XQL || {});

  class XQLError extends Error {
    constructor(message, pos, hint) {
      super(message);
      this.name = 'XQLError';
      this.pos = pos == null ? null : pos;
      this.hint = hint || null;
    }
  }
  XQL.XQLError = XQLError;

  // Longest operators first so "!~=" wins over "!=" and "->" over "-".
  const OPS = ['!~=', '~=', '!=', '<=', '>=', '->', '|', ',', '(', ')', '=', '<', '>', '+', '-', '*', '/', '[', ']', '{', '}', '.'];

  function unescapeTriple(raw) {
    return raw.replace(/\\(n|t|r|\\|")/g, (m, c) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"' })[c]);
  }

  function tokenize(src) {
    const tokens = [];
    const n = src.length;
    let i = 0;
    const push = (type, value, start, extra) => tokens.push(Object.assign({ type, value, start, end: i }, extra || {}));

    while (i < n) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (ch === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end < 0) throw new XQLError('Unterminated /* comment */', i);
        i = end + 2; continue;
      }
      const start = i;

      if (ch === '"') {
        if (src.startsWith('"""', i)) {
          const end = src.indexOf('"""', i + 3);
          if (end < 0) throw new XQLError('Unterminated triple-quoted string', i);
          const raw = src.slice(i + 3, end);
          i = end + 3;
          push('string', unescapeTriple(raw), start, { triple: true, raw });
          continue;
        }
        let j = i + 1;
        while (j < n && src[j] !== '"' && src[j] !== '\n') j++;
        if (src[j] !== '"') throw new XQLError('Unterminated string. XQL strings use double quotes, for example "powershell.exe"', i);
        const raw = src.slice(i + 1, j);
        i = j + 1;
        push('string', raw, start, { triple: false, raw });
        continue;
      }

      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i;
        while (j < n && /[0-9]/.test(src[j])) j++;
        if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        const numText = src.slice(i, j);
        let k = j;
        while (k < n && /[A-Za-z]/.test(src[k])) k++;
        if (k > j) {
          const unit = src.slice(j, k).toLowerCase();
          i = k;
          push('duration', { value: Number(numText), unit }, start, { text: numText + unit });
          continue;
        }
        i = j;
        push('number', Number(numText), start, { text: numText });
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_.]/.test(src[j])) j++;
        while (src[j - 1] === '.') j--; // never swallow a trailing dot
        const text = src.slice(i, j);
        i = j;
        push('ident', text, start);
        continue;
      }

      let matched = null;
      for (const op of OPS) { if (src.startsWith(op, i)) { matched = op; break; } }
      if (matched) { i += matched.length; push('op', matched, start); continue; }

      if (ch === "'") throw new XQLError("XQL uses double quotes for strings, not single quotes. Write \"value\" instead of 'value'.", i);
      throw new XQLError(`Unexpected character '${ch}'`, i);
    }
    push('eof', null, i);
    return tokens;
  }

  function posToLineCol(src, pos) {
    const before = src.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    return { line, col };
  }

  XQL.tokenize = tokenize;
  XQL.posToLineCol = posToLineCol;
})(typeof globalThis !== 'undefined' ? globalThis : this);
