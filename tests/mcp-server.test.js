/**
 * MCP server behaviour tests.
 *
 * These drive the tool handlers directly. Manifest conformance is checked
 * separately by scripts/validate_agent_plugins.py — that verifies the plugin is
 * SHAPED correctly, which is not the same as it WORKING. A manifest declaring
 * `./mcp/server.js` passed spec validation cleanly while that file did not exist.
 *
 * Every assertion below is about behaviour a user would notice.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const server = require('../mcp/server.js');
const { validatePineScript, lookupPineReference, TOOLS, engineLoaded } = server;

const HEADER = '//@version=6\nindicator("t", overlay=true)\n';

//──────────────────────────────────────────────────────────
// Tool declarations
//──────────────────────────────────────────────────────────

test('declares exactly the two documented tools', () => {
  assert.deepStrictEqual(
    TOOLS.map(t => t.name).sort(),
    ['lookup_pine_reference', 'validate_pine_script']
  );
});

test('every tool has a description and an input schema', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.description && tool.description.length > 40,
      `${tool.name} needs a description that tells an agent when to call it`);
    assert.strictEqual(tool.inputSchema.type, 'object', `${tool.name} schema`);
  }
});

//──────────────────────────────────────────────────────────
// Engine availability
//
// If the engine is missing the tools must say so plainly. Reporting "valid" when
// nothing was actually checked is the worst possible failure for this plugin.
//──────────────────────────────────────────────────────────

test('missing engine is reported, never silently treated as valid', { skip: engineLoaded ? 'engine present' : false }, () => {
  const result = validatePineScript({ code: HEADER });
  assert.strictEqual(result.error, true);
  assert.match(result.message, /not found/i);
  assert.notStrictEqual(result.valid, true, 'must not claim validity without validating');
});

//──────────────────────────────────────────────────────────
// validate_pine_script
//──────────────────────────────────────────────────────────

test('accepts valid Pine, including the coordinate drawing overloads', { skip: !engineLoaded }, () => {
  const result = validatePineScript({
    code: HEADER +
      'l = line.new(x1=bar_index[1], y1=low[1], x2=bar_index, y2=high)\n' +
      'b = box.new(left=bar_index[5], top=high, right=bar_index, bottom=low)\n' +
      'lb = label.new(x=bar_index, y=high, text="hi")\n',
  });
  assert.strictEqual(result.valid, true,
    'coordinate overloads are official v6: ' + JSON.stringify(result.diagnostics));
  assert.strictEqual(result.error_count, 0);
});

test('rejects a wrong parameter name and names it', { skip: !engineLoaded }, () => {
  const result = validatePineScript({
    code: HEADER + 'l = line.new(x1=1, y1=2, x2=3, y2=4, colour=color.red)\n',
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.diagnostics.some(d => d.message.includes('colour')),
    'the diagnostic must name the offending parameter');
});

test('runs BOTH diagnostic paths, not just the validator', { skip: !engineLoaded }, () => {
  // `shape=` on plotshape is caught by documentChecks, not AccurateValidator.
  // A server wired to only one path would call this clean.
  const result = validatePineScript({
    code: HEADER + 'plotshape(close > open, shape=shape.triangleup)\n',
  });
  assert.strictEqual(result.valid, false,
    'documentChecks must be wired in, or the tool disagrees with the editor');
  assert.ok(result.diagnostics.some(d => d.message.includes('style')));
});

test('an alertcondition message containing a comma is not an error', { skip: !engineLoaded }, () => {
  const result = validatePineScript({
    code: HEADER + 'c = close > open\n' +
      'alertcondition(c, title="T", message="Conditions met, reduce size or tighten stops")\n',
  });
  assert.strictEqual(result.valid, true,
    'a comma inside a string is not an argument separator: ' + JSON.stringify(result.diagnostics));
});

test('reports diagnostics with usable line numbers', { skip: !engineLoaded }, () => {
  const result = validatePineScript({ code: HEADER + '\n\nz = math.nonexistent(1)\n' });
  assert.ok(result.diagnostics.length > 0);
  assert.strictEqual(result.diagnostics[0].line, 5);
});

test('requires either code or file_path', () => {
  const result = validatePineScript({});
  assert.strictEqual(result.error, true);
  assert.match(result.message, /code.*file_path/i);
});

test('an unreadable file_path is an explicit error, not a pass', () => {
  const result = validatePineScript({ file_path: '/nonexistent/nope.pine' });
  assert.strictEqual(result.error, true);
  assert.notStrictEqual(result.valid, true);
});

//──────────────────────────────────────────────────────────
// lookup_pine_reference
//──────────────────────────────────────────────────────────

test('returns both overloads for line.new', { skip: !engineLoaded }, () => {
  const result = lookupPineReference({ symbol: 'line.new' });
  assert.strictEqual(result.found, true);
  assert.ok(result.overloads.length >= 2,
    'flattening overloads is what made the coordinate form look invalid');

  const allParams = result.overloads.flatMap(o => [...o.required_parameters, ...o.optional_parameters]);
  assert.ok(allParams.includes('x1'), 'the coordinate overload must be reachable');
  assert.ok(allParams.includes('first_point'), 'the chart.point overload must be reachable');
});

test('returns required and optional parameters for a plain function', { skip: !engineLoaded }, () => {
  const result = lookupPineReference({ symbol: 'ta.sma' });
  assert.strictEqual(result.found, true);
  assert.deepStrictEqual(result.required_parameters, ['source', 'length']);
});

test('knows API added after the reference scrape', { skip: !engineLoaded }, () => {
  const result = lookupPineReference({ symbol: 'request.footprint' });
  assert.strictEqual(result.found, true, 'request.footprint shipped January 2026');
});

test('an unknown symbol returns suggestions rather than a bare miss', { skip: !engineLoaded }, () => {
  const result = lookupPineReference({ symbol: 'ta.smaa' });
  assert.strictEqual(result.found, false);
  assert.ok(Array.isArray(result.suggestions));
  assert.ok(result.suggestions.some(s => s.includes('sma')),
    'a near-miss should point at the real name');
});

test('requires a symbol', () => {
  const result = lookupPineReference({});
  assert.strictEqual(result.error, true);
});
