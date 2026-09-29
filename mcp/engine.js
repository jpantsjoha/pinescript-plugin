/**
 * Pine validation engine resolver, shared by the MCP server (mcp/server.js), the
 * PostToolUse hook (hooks/validate-pine.sh) and the embedded-example gate
 * (scripts/validate_skill_examples.py via scripts/validate_pine.js). One resolver,
 * so the three can never run different engines.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Load the validation engine.
 *
 * Primary source is the published `pinescript-v6-validator` package, so the plugin
 * works for anyone who installs it — no checkout of the extension required.
 *
 * PINESCRIPT_VALIDATOR, when set, names a built checkout of
 * jpantsjoha/pinescript-vscode-extension and wins over npm: it exists to develop
 * against an unreleased engine, and an override the npm package silently beat would
 * test the wrong code. Without it, sibling and iCloud checkouts are tried only when
 * the npm package is missing.
 *
 * A checkout exposes the engine in one of two places since the extension's
 * single-engine change (#55): `dist/engine/index.js` (the copy the VSIX ships) or
 * `packages/validator/dist/index.js` (the package build). Both export the same
 * surface as the npm package, so every branch returns the same shape.
 */
const CHECKOUT_ENGINE_PATHS = ['dist/engine/index.js', 'packages/validator/dist/index.js'];

function engineFrom(pkg, base) {
  return {
    base,
    AccurateValidator: pkg.AccurateValidator,
    runDocumentChecks: pkg.runDocumentChecks,
    validatePineScript: pkg.validatePineScript,
    signatures: pkg.PINE_FUNCTIONS_MERGED || {},
  };
}

function loadFromCheckout(base) {
  for (const rel of CHECKOUT_ENGINE_PATHS) {
    const entry = path.join(base, rel);
    if (!fs.existsSync(entry)) continue;
    try {
      const pkg = require(entry);
      if (typeof pkg.AccurateValidator !== 'function') continue;
      return engineFrom(pkg, entry);
    } catch (error) {
      process.stderr.write(`[pinescript-mcp] engine at ${entry} failed to load: ${error.message}\n`);
    }
  }
  return null;
}

function loadEngine() {
  if (process.env.PINESCRIPT_VALIDATOR) {
    const pinned = loadFromCheckout(process.env.PINESCRIPT_VALIDATOR);
    if (pinned) return pinned;
    process.stderr.write(
      `[pinescript-mcp] PINESCRIPT_VALIDATOR=${process.env.PINESCRIPT_VALIDATOR} has no built engine ` +
      `(${CHECKOUT_ENGINE_PATHS.join(' or ')}); falling back to npm\n`
    );
  }

  try {
    return engineFrom(require('pinescript-v6-validator'), 'pinescript-v6-validator (npm)');
  } catch (error) {
    process.stderr.write(`[pinescript-mcp] npm engine unavailable (${error.message}); trying local checkouts\n`);
  }

  const candidates = [
    path.join(__dirname, '..', '..', 'pinescript-vscode-extension'),
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Documents/workspaces/pinescript-vscode-extension'
    ),
  ];
  for (const base of candidates) {
    const found = loadFromCheckout(base);
    if (found) return found;
  }
  return null;
}

module.exports = { loadEngine, CHECKOUT_ENGINE_PATHS };
