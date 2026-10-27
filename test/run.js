// Runs the engine tests and the exercise validator.
const { spawnSync } = require('child_process');
const path = require('path');
let code = 0;
for (const f of ['engine.test.js', 'validate-exercises.js']) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status) code = r.status;
}
process.exitCode = code;
