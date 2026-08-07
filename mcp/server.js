#!/usr/bin/env node
/**
 * Pine Script v6 MCP server.
 *
 * Two tools, both grounded in the validation engine from
 * jpantsjoha/pinescript-vscode-extension rather than in the model's recollection:
 *
 *   validate_pine_script   — run both diagnostic paths, return structured errors
 *   lookup_pine_reference  — the real signature for a v6 symbol
 *
 * The second matters more than it looks. Agents write Pine confidently and wrongly:
 * inventing `colour` for `color`, `shape=` where `style=` belongs, or missing that
 * `line.new` has two overloads. Guessing parameter names is the single most common
 * source of Pine compile errors, and a reference lookup removes the guess.
 *
 * The engine is located at runtime rather than vendored. A copy would drift, and a
 * drifted copy means this server contradicts the user's editor — the one outcome
 * worth engineering hardest against.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

//──────────────────────────────────────────────────────────
// Engine discovery
//──────────────────────────────────────────────────────────

/**
 * Load the validation engine.
 *
 * Primary source is the published `pinescript-v6-validator` package, so the plugin
 * works for anyone who installs it — no checkout of the extension required. The
 * on-disk fallbacks remain for development against unreleased engine changes.
 */
function loadEngine() {
  try {
    const pkg = require('pinescript-v6-validator');
    return {
      base: 'pinescript-v6-validator (npm)',
      AccurateValidator: pkg.AccurateValidator,
      runDocumentChecks: pkg.runDocumentChecks,
      validatePineScript: pkg.validatePineScript,
      signatures: pkg.PINE_FUNCTIONS_MERGED || {},
    };
  } catch (error) {
    process.stderr.write(`[pinescript-mcp] npm engine unavailable (${error.message}); trying local checkouts\n`);
  }

  const candidates = [];
  if (process.env.PINESCRIPT_VALIDATOR) candidates.push(process.env.PINESCRIPT_VALIDATOR);
  candidates.push(path.join(__dirname, '..', '..', 'pinescript-vscode-extension'));
  candidates.push(
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Documents/workspaces/pinescript-vscode-extension'
    )
  );

  for (const base of candidates) {
    const validatorPath = path.join(base, 'dist/src/parser/accurateValidator.js');
    const checksPath = path.join(base, 'dist/src/parser/documentChecks.js');
    const dataPath = path.join(base, 'dist/v6/parameter-requirements-merged.js');
    if (!fs.existsSync(validatorPath) || !fs.existsSync(checksPath)) continue;
    try {
      return {
        base,
        AccurateValidator: require(validatorPath).AccurateValidator,
        runDocumentChecks: require(checksPath).runDocumentChecks,
        signatures: fs.existsSync(dataPath) ? require(dataPath).PINE_FUNCTIONS_MERGED : {},
      };
    } catch (error) {
      process.stderr.write(`[pinescript-mcp] engine at ${base} failed to load: ${error.message}\n`);
    }
  }
  return null;
}

const engine = loadEngine();

const ENGINE_MISSING_HINT =
  'Pine validation engine not found. Run `npm install` in the plugin directory to ' +
  'fetch pinescript-v6-validator, or set PINESCRIPT_VALIDATOR to a built checkout ' +
  'of jpantsjoha/pinescript-vscode-extension.';

const SEVERITY_LABEL = { 0: 'error', 1: 'warning', 2: 'info', 3: 'hint' };

//──────────────────────────────────────────────────────────
// Tools
//──────────────────────────────────────────────────────────

function validatePineScript({ code, file_path: filePath }) {
  // Argument errors are reported BEFORE engine availability. A caller who passed
  // nothing has a problem with their call, not with the installation, and telling
  // them to go clone a repository sends them down the wrong path entirely.
  if (!code && !filePath) {
    return { error: true, message: 'Provide either `code` or `file_path`.' };
  }

  let source = code;
  if (!source && filePath) {
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      return { error: true, message: `Cannot read ${filePath}: ${error.message}` };
    }
  }
  if (!source) return { error: true, message: 'Provide either `code` or `file_path`.' };

  if (!engine) return { error: true, message: ENGINE_MISSING_HINT };

  // ALL diagnostic sources including the semantic checks, and with `// pine-ignore`
  // honoured — validatePineScript aggregates exactly what the editor shows. A tool
  // reporting a subset would tell the agent a file is clean while the user sees
  // squiggles.
  const diagnostics = engine.validatePineScript
    ? engine.validatePineScript(source)
    : [
        ...new engine.AccurateValidator().validate(source),
        ...engine.runDocumentChecks(source),
      ].sort((a, b) => a.line - b.line || a.column - b.column);

  const errors = diagnostics.filter(d => d.severity === 0);
  const warnings = diagnostics.filter(d => d.severity === 1);

  return {
    valid: errors.length === 0,
    error_count: errors.length,
    warning_count: warnings.length,
    diagnostics: diagnostics.map(d => ({
      line: d.line,
      column: d.column,
      severity: SEVERITY_LABEL[d.severity] || 'error',
      message: d.message,
      // Present only on semantic findings (S1-S9). Its absence marks a syntactic
      // diagnostic, which cannot be suppressed.
      ...(d.checkId ? { check: d.checkId } : {}),
    })),
    summary: errors.length === 0
      ? `Valid Pine v6${warnings.length ? ` (${warnings.length} warning(s))` : ''}`
      : `${errors.length} error(s), ${warnings.length} warning(s)`,
  };
}

function lookupPineReference({ symbol }) {
  if (!symbol) return { error: true, message: 'Provide a `symbol`, e.g. "line.new".' };
  if (!engine) return { error: true, message: ENGINE_MISSING_HINT };

  const spec = engine.signatures[symbol];
  if (spec) {
    return {
      found: true,
      name: symbol,
      signature: spec.signature || spec.syntax,
      description: spec.description,
      required_parameters: spec.requiredParams || [],
      optional_parameters: spec.optionalParams || [],
      // Overloads are surfaced explicitly: flattening them is precisely what made
      // the coordinate form of line.new/label.new/box.new look invalid.
      overloads: (spec.overloads || []).map(o => ({
        signature: o.signature,
        required_parameters: o.requiredParams,
        optional_parameters: o.optionalParams,
      })),
    };
  }

  // Near-miss suggestions turn "not found" into something actionable — the usual
  // cause is a wrong namespace or a plural/singular slip.
  const needle = symbol.toLowerCase();
  const suggestions = Object.keys(engine.signatures)
    .filter(name => {
      const lower = name.toLowerCase();
      return lower.includes(needle) || needle.includes(lower.split('.').pop());
    })
    .slice(0, 8);

  return {
    found: false,
    name: symbol,
    message: `'${symbol}' is not a known Pine v6 function in the bundled reference.`,
    suggestions,
  };
}

//──────────────────────────────────────────────────────────
// Wiring
//──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'validate_pine_script',
    description:
      'Validate Pine Script v6 source and return structured diagnostics with line ' +
      'numbers. Runs the same two diagnostic paths as the VS Code extension, so the ' +
      'result matches what the user sees in their editor. Call this before telling ' +
      'anyone a script works.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Pine Script v6 source to validate.' },
        file_path: { type: 'string', description: 'Path to a .pine file to validate instead.' },
      },
    },
  },
  {
    name: 'lookup_pine_reference',
    description:
      'Return the real signature of a Pine Script v6 built-in — required and ' +
      'optional parameters, and every overload. Use this instead of recalling a ' +
      'signature: wrong parameter names are the most common Pine compile error, and ' +
      'several drawing functions have two valid call forms.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Fully qualified name, e.g. "line.new", "ta.sma", "strategy.entry".',
        },
      },
      required: ['symbol'],
    },
  },
];

const server = new Server(
  { name: 'pinescript', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args = {} } = request.params;
  let result;

  try {
    if (name === 'validate_pine_script') result = validatePineScript(args);
    else if (name === 'lookup_pine_reference') result = lookupPineReference(args);
    else result = { error: true, message: `Unknown tool: ${name}` };
  } catch (error) {
    result = { error: true, message: `${name} failed: ${error.message}` };
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// Exported for the smoke tests, which drive the handlers directly rather than
// booting stdio.
module.exports = { validatePineScript, lookupPineReference, TOOLS, engineLoaded: Boolean(engine) };

if (require.main === module) {
  const transport = new StdioServerTransport();
  server.connect(transport).catch(error => {
    process.stderr.write(`[pinescript-mcp] fatal: ${error.message}\n`);
    process.exit(1);
  });
}
