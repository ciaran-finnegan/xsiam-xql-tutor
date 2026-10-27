// Server-side helpers: grading with the shared engine, handle rules, crypto helpers. Run with `node test/server.test.mjs`.
import { XQL, exerciseById, gradeAnswer, pointsFor, validHandle, sha256Hex, hmacHex, timingSafeEqual, getCookie, cookie, normalizeEmail, validEmail, randomCode, firstName } from '../server/lib.js';

let passed = 0, failed = 0; const failures = [];
const test = (name, fn) => Promise.resolve().then(fn).then(() => passed++, (e) => { failed++; failures.push({ name, e }); });
const eq = (a, b, m) => { const sa = JSON.stringify(a), sb = JSON.stringify(b); if (sa !== sb) throw new Error(`${m || 'not equal'}: got ${sa}, expected ${sb}`); };

const write = XQL.EXERCISES.find((e) => e.type === 'write');
const mcq = XQL.EXERCISES.find((e) => e.type === 'mcq');
const bug = XQL.EXERCISES.find((e) => e.type === 'bug');
const cloze = XQL.EXERCISES.find((e) => e.type === 'cloze');

await test('engine and exercises load on the server', () => { eq(XQL.EXERCISES.length > 100, true); eq(!!exerciseById(write.id), true); });
await test('write card: the model solution grades correct', () => eq(gradeAnswer(write, write.solution).correct, true));
await test('write card: a wrong query grades incorrect', () => eq(gradeAnswer(write, 'dataset = xdr_data | limit 1').correct, false));
await test('write card: an unparsable query grades incorrect without throwing', () => eq(gradeAnswer(write, 'dataset = | nonsense').correct, false));
await test('cloze card: filled template grades correct', () => { let i = 0; const q = cloze.template.replace(/___/g, () => cloze.answers[i++][0]); eq(gradeAnswer(cloze, q).correct, true); });
await test('mcq card: index comparison', () => { eq(gradeAnswer(mcq, mcq.answer).correct, true); eq(gradeAnswer(mcq, (mcq.answer + 1) % mcq.choices.length).correct, false); eq(gradeAnswer(mcq, 'abc').correct, false); });
await test('bug card: line comparison', () => { eq(gradeAnswer(bug, bug.bugLine).correct, true); eq(gradeAnswer(bug, bug.bugLine + 1).correct, false); });
await test('unknown card grades incorrect', () => eq(gradeAnswer(null, 0).correct, false));
await test('points scale with type and difficulty', () => { eq(pointsFor({ type: 'write', difficulty: 4 }), 12); eq(pointsFor({ type: 'mcq', difficulty: 1 }), 1); eq(pointsFor({ type: 'cloze', difficulty: 9 }), 10); });
await test('handle validation', () => { eq(validHandle('dwight_s'), true); eq(validHandle('ab'), false); eq(validHandle('admin'), false); eq(validHandle('bad handle'), false); eq(validHandle('-lead'), false); eq(validHandle('a'.repeat(21)), false); });
await test('email helpers', () => { eq(normalizeEmail('  A.B@Example.COM '), 'a.b@example.com'); eq(validEmail('a@b.co'), true); eq(validEmail('nope'), false); });
await test('first name extraction', () => { eq(firstName('Dwight K. Schrute'), 'Dwight'); eq(firstName(''), ''); });
await test('sha256 and hmac are deterministic and distinct', async () => { eq(await sha256Hex('x'), await sha256Hex('x')); eq((await hmacHex('k', 'x')) !== (await hmacHex('k2', 'x')), true); });
await test('timing safe equal', () => { eq(timingSafeEqual('abc', 'abc'), true); eq(timingSafeEqual('abc', 'abd'), false); eq(timingSafeEqual('abc', 'ab'), false); });
await test('cookies round trip', () => { const c = cookie('xqlt_session', 'v', { maxAge: 10 }); eq(/HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Lax/.test(c), true); eq(getCookie(new Request('https://x/', { headers: { cookie: 'a=1; xqlt_session=v; b=2' } }), 'xqlt_session'), 'v'); });
await test('otp codes are six digits', () => { for (let i = 0; i < 50; i++) eq(/^\d{6}$/.test(randomCode()), true); });

console.log(`server tests: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f.name}\n     ${f.e.message}`);
if (failed) process.exitCode = 1;
