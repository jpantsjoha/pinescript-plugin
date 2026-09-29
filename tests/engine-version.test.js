/**
 * The plugin must run engine 0.4.x, not the 0.3.0 it was pinned to.
 *
 * `^0.3.0` on a 0.x package allows only 0.3.x, so every 0.4.x fix silently missed
 * the plugin: the MCP tool and the hook disagreed with the VS Code extension. The
 * two probes below are rules 0.4.x added and 0.3.0 lacks, so they fail on the old
 * pin and pass on the new one. Each has a paired "still clean" case, because a
 * false positive is worse than a missed error.
 *
 * Every test here runs in a child process with PINESCRIPT_VALIDATOR removed from
 * the environment, so a developer's override cannot make the suite test a
 * different engine from the one users install.
 */

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENGINE_JS = path.join(ROOT, 'mcp', 'engine.js');
const SERVER_JS = path.join(ROOT, 'mcp', 'server.js');
const CLI = path.join(ROOT, 'scripts', 'validate_pine.js');
const HOOK = path.join(ROOT, 'hooks', 'validate-pine.sh');
const NPM_ENTRY = require.resolve('pinescript-v6-validator');

const HEADER = '//@version=6\nindicator("t", overlay=true)\n';

const { PINESCRIPT_VALIDATOR: _ignored, ...CLEAN_ENV } = process.env;

const scratch = [];
after(() => { for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true }); });
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

/** Run a snippet in a child with a controlled PINESCRIPT_VALIDATOR; return its JSON. */
function inChild(body, validator) {
  const env = validator === undefined ? CLEAN_ENV : { ...CLEAN_ENV, PINESCRIPT_VALIDATOR: validator };
  const run = spawnSync(process.execPath, ['-e', body], { env, encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

/** Validate through the MCP server exactly as an agent's tool call would. */
function viaServer(code) {
  return inChild(`
    const s = require(${JSON.stringify(SERVER_JS)});
    const r = s.validatePineScript({ code: ${JSON.stringify(code)} });
    console.log(JSON.stringify({ base: s.engineBase, result: r }));`);
}
const errorsOf = result => result.diagnostics.filter(d => d.severity === 'error');

//──────────────────────────────────────────────────────────
// The engine the server actually loads is npm 0.4.x
//──────────────────────────────────────────────────────────

test('the server loads the npm engine, and it is 0.4.x', () => {
  const got = inChild(`
    const s = require(${JSON.stringify(SERVER_JS)});
    console.log(JSON.stringify({ base: s.engineBase,
      version: require('pinescript-v6-validator/package.json').version }));`);
  assert.strictEqual(got.base, 'pinescript-v6-validator (npm)');
  assert.match(got.version, /^0\.4\.\d+$/, `plugin resolves pinescript-v6-validator@${got.version}`);
});

test('flags an invalid cast: int declared from input.float()', () => {
  const { result } = viaServer(HEADER + 'int x = input.float(1.0)\nplot(x)\n');
  assert.strictEqual(result.valid, false,
    'input.float returns float; TradingView rejects it as int: ' + JSON.stringify(result.diagnostics));
  assert.ok(errorsOf(result).some(d => d.line === 3 && /input\.float/.test(d.message)),
    JSON.stringify(result.diagnostics));
});

test('still clean: float declared from input.float()', () => {
  const { result } = viaServer(HEADER + 'float x = input.float(1.0)\nplot(x)\n');
  assert.strictEqual(errorsOf(result).length, 0, JSON.stringify(result.diagnostics));
});

test('flags a misspelled constant: color.purplee', () => {
  const { result } = viaServer(HEADER + 'plot(close, color=color.purplee)\n');
  assert.strictEqual(result.valid, false, JSON.stringify(result.diagnostics));
  assert.ok(errorsOf(result).some(d => /purplee/.test(d.message)), JSON.stringify(result.diagnostics));
});

test('still clean: color.purple', () => {
  const { result } = viaServer(HEADER + 'plot(close, color=color.purple)\n');
  assert.strictEqual(errorsOf(result).length, 0, JSON.stringify(result.diagnostics));
});

//──────────────────────────────────────────────────────────
// Checkout resolution (PINESCRIPT_VALIDATOR)
//
// The extension's single-engine change removed dist/src/parser/*, so the old
// fallback could never find a checkout. A checkout now exposes the engine at
// dist/engine/index.js or packages/validator/dist/index.js; both must load, in that
// order, and return the same shape as the npm branch.
//──────────────────────────────────────────────────────────

function fakeCheckout(entries) {
  const base = tempDir('pine-checkout-');
  for (const [rel, body] of Object.entries(entries)) {
    const file = path.join(base, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return base;
}
const REEXPORT = `module.exports = require(${JSON.stringify(NPM_ENTRY)});\n`;

function resolveWith(base) {
  return inChild(`
    const e = require(${JSON.stringify(ENGINE_JS)}).loadEngine();
    const r = e.validatePineScript('//@version=6\\nindicator("t")\\nint x = input.float(1.0)\\nplot(x)\\n');
    console.log(JSON.stringify({
      base: e.base,
      shape: ['AccurateValidator', 'runDocumentChecks', 'validatePineScript'].map(k => typeof e[k]),
      signatures: Object.keys(e.signatures).length,
      errors: r.filter(d => d.severity === 0).length,
    }));`, base);
}

test('PINESCRIPT_VALIDATOR loads a checkout\'s dist/engine/index.js first', () => {
  const base = fakeCheckout({
    'dist/engine/index.js': REEXPORT,
    'packages/validator/dist/index.js': REEXPORT,
  });
  const got = resolveWith(base);
  assert.strictEqual(got.base, path.join(base, 'dist/engine/index.js'));
  assert.deepStrictEqual(got.shape, ['function', 'function', 'function']);
  assert.ok(got.signatures > 400, `signatures: ${got.signatures}`);
  assert.strictEqual(got.errors, 1);
});

test('PINESCRIPT_VALIDATOR falls back to packages/validator/dist/index.js', () => {
  const base = fakeCheckout({ 'packages/validator/dist/index.js': REEXPORT });
  const got = resolveWith(base);
  assert.strictEqual(got.base, path.join(base, 'packages/validator/dist/index.js'));
  assert.deepStrictEqual(got.shape, ['function', 'function', 'function']);
});

test('a checkout entry without validatePineScript is skipped, not half-loaded', () => {
  // An old engine build that exports AccurateValidator alone would run a subset of
  // the checks and report files clean that the editor flags.
  const base = fakeCheckout({
    'dist/engine/index.js': `const e = require(${JSON.stringify(NPM_ENTRY)});\n` +
      'module.exports = { AccurateValidator: e.AccurateValidator };\n',
    'packages/validator/dist/index.js': REEXPORT,
  });
  assert.strictEqual(resolveWith(base).base, path.join(base, 'packages/validator/dist/index.js'));
});

test('a PINESCRIPT_VALIDATOR with no built engine falls back to npm', () => {
  assert.strictEqual(resolveWith(tempDir('pine-empty-')).base, 'pinescript-v6-validator (npm)');
});

//──────────────────────────────────────────────────────────
// scripts/validate_pine.js and the hook built on it
//──────────────────────────────────────────────────────────

function pineFile(body, dirName = 'dir with space') {
  const dir = path.join(tempDir('pine-cli-'), dirName);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'a.pine');
  fs.writeFileSync(file, body);
  return file;
}
const cli = (args, env = CLEAN_ENV) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });

test('validate_pine.js: 0 on clean, 1 on errors, 2 with no files or an unreadable file', () => {
  assert.strictEqual(cli([pineFile(HEADER + 'plot(close)\n')]).status, 0);

  const bad = pineFile(HEADER + 'plot(close, color=color.purplee)\n');
  const run = cli([bad]);
  assert.strictEqual(run.status, 1);
  assert.match(run.stdout, /^ERROR .*a\.pine:L3:\d+ {2}Unknown color constant or function 'purplee'$/m);

  const plain = cli(['--plain', bad]);
  assert.strictEqual(plain.status, 1);
  assert.match(plain.stdout, /^ {2}L3:\d+ {2}Unknown color constant/m);

  assert.strictEqual(cli([]).status, 2, 'no files must not read as "validated clean"');
  assert.strictEqual(cli(['/nonexistent/x.pine']).status, 2);
  assert.strictEqual(cli(['--probe']).stdout.trim(), 'pinescript-v6-validator (npm)');
});

const hookAvailable = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
function hook(filePath, env = CLEAN_ENV) {
  return spawnSync('bash', [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }), env, encoding: 'utf8',
  });
}

test('hook blocks (exit 2) on a real error and stays silent otherwise', { skip: !hookAvailable && 'jq not installed' }, () => {
  const bad = pineFile(HEADER + 'plot(close, color=color.purplee)\n');
  const run = hook(bad);
  assert.strictEqual(run.status, 2);
  assert.match(run.stderr, /Pine validation failed for .*a\.pine/);
  assert.match(run.stderr, /^ {2}L3:\d+ {2}Unknown color constant or function 'purplee'$/m);

  assert.strictEqual(hook(pineFile(HEADER + 'plot(close)\n')).status, 0);
  assert.strictEqual(hook('/tmp/not-pine.txt').status, 0);
});

test('hook output carries diagnostics only, never resolver notices', { skip: !hookAvailable && 'jq not installed' }, () => {
  const bad = pineFile(HEADER + 'plot(close, color=color.purplee)\n');
  const run = hook(bad, { ...CLEAN_ENV, PINESCRIPT_VALIDATOR: '/nonexistent-checkout' });
  assert.strictEqual(run.status, 2);
  assert.doesNotMatch(run.stderr, /pinescript-mcp|falling back/);
});
