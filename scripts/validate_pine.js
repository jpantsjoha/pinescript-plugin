#!/usr/bin/env node
/**
 * Headless Pine validation through the plugin's own engine resolver (mcp/engine.js),
 * so the hook and the embedded-example gate check with exactly the engine the MCP
 * server runs.
 *
 *   node scripts/validate_pine.js <file.pine> [...]           validate files
 *   node scripts/validate_pine.js --plain <file.pine> [...]   same, lines without the file
 *   node scripts/validate_pine.js --probe                     print the engine in use
 *
 * Exit: 0 no errors · 1 at least one severity-0 diagnostic · 2 tooling failure or
 * usage error · 3 no engine found.
 * Error lines go to stdout as `ERROR <file>:L<line>:<col>  <message>`, or with
 * --plain as `  L<line>:<col>  <message>`. Everything else goes to stderr.
 */

'use strict';

const fs = require('fs');
const { loadEngine } = require('../mcp/engine.js');

const args = process.argv.slice(2);
const probe = args.includes('--probe');
const plain = args.includes('--plain');
const files = args.filter(a => a !== '--probe' && a !== '--plain');

// Usage errors first: a call with nothing to check must not exit 0 and read as
// "validated clean".
if (!probe && files.length === 0) {
  console.error('usage: validate_pine.js [--plain] <file.pine> [...] | --probe');
  process.exit(2);
}

const engine = loadEngine();
if (!engine) {
  console.error('no Pine validation engine found — run `npm install` in the plugin directory');
  process.exit(3);
}

if (probe) {
  console.log(engine.base);
  process.exit(0);
}

let failed = false;
for (const file of files) {
  let found;
  try {
    found = engine.validatePineScript(fs.readFileSync(file, 'utf8')).filter(d => d.severity === 0);
  } catch (error) {
    // A crash is a tooling condition, never a verdict on the script: exit 2 so the
    // hook does not block an edit the author cannot fix.
    console.error(`validation of ${file} failed: ${error.message}`);
    process.exit(2);
  }
  for (const d of found) {
    console.log(plain
      ? `  L${d.line}:${d.column}  ${d.message}`
      : `ERROR ${file}:L${d.line}:${d.column}  ${d.message}`);
  }
  if (found.length) failed = true;
}
process.exit(failed ? 1 : 0);
