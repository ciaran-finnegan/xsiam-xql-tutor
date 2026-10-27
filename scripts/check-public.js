// Refuses to publish if anything that must stay private is present in the files git would ship.
// Generic secret patterns live here. Patterns that are themselves private (for example the names of organisations whose
// environments inspired the fictional tenant) are read from the gitignored file .check-public.local (one regular
// expression per line, case-insensitive) and from the CHECK_PUBLIC_PATTERNS environment variable (same format,
// newline-separated), which CI provides from a repository secret. Usage: node scripts/check-public.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const files = execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

const checks = [
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS access key id' },
  { re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, why: 'private key' },
  { re: /\bghp_[A-Za-z0-9]{36}\b/, why: 'GitHub token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, why: 'GitHub fine-grained token' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, why: 'Slack token' },
  { re: /\bsk-[A-Za-z0-9]{32,}\b/, why: 'API secret' },
  { re: /\b(CLOUDFLARE_API_TOKEN|SESSION_SECRET|OTP_PEPPER|[A-Z]+_CLIENT_SECRET)\s*[=:]\s*["']?[A-Za-z0-9_\-]{16,}/, why: 'secret assigned a literal value' },
];
const extra = [];
const addPatterns = (text, source) => {
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    try { extra.push({ re: new RegExp(t, 'i'), why: `private pattern (${source})` }); } catch (e) { console.error(`check-public: bad pattern in ${source}: ${t}`); process.exit(2); }
  }
};
const localFile = path.join(root, '.check-public.local');
if (fs.existsSync(localFile)) addPatterns(fs.readFileSync(localFile, 'utf8'), '.check-public.local');
addPatterns(process.env.CHECK_PUBLIC_PATTERNS, 'CHECK_PUBLIC_PATTERNS');

const problems = [];
for (const f of files) {
  if (/^\.env(\..*)?$|\.dev\.vars/.test(path.basename(f))) { problems.push(`${f}: environment file must not be shipped`); continue; }
  const p = path.join(root, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) continue;
  const buf = fs.readFileSync(p);
  if (buf.includes(0)) continue; // binary
  const text = buf.toString('utf8');
  for (const { re, why } of checks.concat(extra)) {
    const m = text.match(re);
    if (m) problems.push(`${f}: ${why}` + (why.startsWith('private') ? '' : ` (${m[0].slice(0, 12)}…)`));
  }
}
if (problems.length) { console.error('check-public: refusing to publish\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`check-public: ${files.length} files clean (${checks.length} generic + ${extra.length} private patterns)`);
