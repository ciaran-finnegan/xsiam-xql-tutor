// Builds dist/ with only the files the published site needs. Usage: node build.js
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');
const include = ['index.html', 'robots.txt', '_headers', 'LICENSE', 'NOTICE.md', 'css', 'js', 'docs/CONTENT_GUIDE.md', 'docs/DOCUMENTATION_REVIEW.md'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of include) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) { console.warn(`skip missing ${item}`); continue; }
  const dest = path.join(out, item);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}
// never ship test, server or tooling files
let files = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files++; } };
walk(out);
console.log(`built dist/ with ${files} files`);
