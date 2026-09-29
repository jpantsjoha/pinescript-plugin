/**
 * The plugin must run engine 0.4.x, not the 0.3.0 it was pinned to.
 *
 * `^0.3.0` on a 0.x package allows only 0.3.x, so every 0.4.x fix silently missed
 * the plugin: the MCP tool and the hook disagreed with the VS Code extension. The
 * two probes below are rules 0.4.x added and 0.3.0 lacks, so they fail on the old
 * pin and pass on the new one. Each has a paired "still clean" case, because a
 * false positive is worse than a missed error.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { validatePineScript, engineLoaded } = require('../mcp/server.js');

const HEADER = '//@version=6\nindicator("t", overlay=true)\n';
const errorsOf = result => result.diagnostics.filter(d => d.severity === 'error');

test('the npm engine is 0.4.x', () => {
  const { version } = require('pinescript-v6-validator/package.json');
  assert.match(version, /^0\.4\.\d+$/, `plugin resolves pinescript-v6-validator@${version}`);
});

test('flags an invalid cast: int declared from input.float()', { skip: !engineLoaded }, () => {
  const result = validatePineScript({ code: HEADER + 'int x = input.float(1.0)\nplot(x)\n' });
  assert.strictEqual(result.valid, false,
    'input.float returns float; TradingView rejects it as int: ' + JSON.stringify(result.diagnostics));
  assert.ok(errorsOf(result).some(d => d.line === 3), JSON.stringify(result.diagnostics));
});

test('still clean: float declared from input.float()', { skip: !engineLoaded }, () => {
  const result = validatePineScript({ code: HEADER + 'float x = input.float(1.0)\nplot(x)\n' });
  assert.strictEqual(errorsOf(result).length, 0, JSON.stringify(result.diagnostics));
});

test('flags a misspelled constant: color.purplee', { skip: !engineLoaded }, () => {
  const result = validatePineScript({ code: HEADER + 'plot(close, color=color.purplee)\n' });
  assert.strictEqual(result.valid, false, JSON.stringify(result.diagnostics));
  assert.ok(errorsOf(result).some(d => /purplee/.test(d.message)), JSON.stringify(result.diagnostics));
});

test('still clean: color.purple', { skip: !engineLoaded }, () => {
  const result = validatePineScript({ code: HEADER + 'plot(close, color=color.purple)\n' });
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

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const NPM_ENTRY = require.resolve('pinescript-v6-validator');

function fakeCheckout(entries) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pine-checkout-'));
  for (const [rel, tag] of Object.entries(entries)) {
    const file = path.join(base, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file,
      `module.exports = { ...require(${JSON.stringify(NPM_ENTRY)}), __tag: ${JSON.stringify(tag)} };\n`);
  }
  return base;
}

function resolveWith(base) {
  const probe = `
    const e = require(${JSON.stringify(path.join(__dirname, '..', 'mcp', 'engine.js'))}).loadEngine();
    const r = e.validatePineScript('//@version=6\\nindicator("t")\\nint x = input.float(1.0)\\nplot(x)\\n');
    console.log(JSON.stringify({
      base: e.base,
      shape: ['AccurateValidator', 'runDocumentChecks', 'validatePineScript'].map(k => typeof e[k]),
      signatures: Object.keys(e.signatures).length,
      errors: r.filter(d => d.severity === 0).length,
    }));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', probe], {
    env: { ...process.env, PINESCRIPT_VALIDATOR: base },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString());
}

test('PINESCRIPT_VALIDATOR loads a checkout\'s dist/engine/index.js first', () => {
  const base = fakeCheckout({
    'dist/engine/index.js': 'bundled',
    'packages/validator/dist/index.js': 'package',
  });
  const got = resolveWith(base);
  assert.strictEqual(got.base, path.join(base, 'dist/engine/index.js'));
  assert.deepStrictEqual(got.shape, ['function', 'function', 'function']);
  assert.ok(got.signatures > 400, `signatures: ${got.signatures}`);
  assert.strictEqual(got.errors, 1);
});

test('PINESCRIPT_VALIDATOR falls back to packages/validator/dist/index.js', () => {
  const base = fakeCheckout({ 'packages/validator/dist/index.js': 'package' });
  const got = resolveWith(base);
  assert.strictEqual(got.base, path.join(base, 'packages/validator/dist/index.js'));
  assert.deepStrictEqual(got.shape, ['function', 'function', 'function']);
});

test('a PINESCRIPT_VALIDATOR with no built engine falls back to npm', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pine-empty-'));
  assert.strictEqual(resolveWith(base).base, 'pinescript-v6-validator (npm)');
});
