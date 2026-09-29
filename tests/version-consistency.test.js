/**
 * One plugin version, everywhere it is written.
 *
 * package.json is the source of truth. Before 0.5.0 the version was 0.4.3 in
 * package.json and the manifests but 0.4.2 in PLUGIN.md, plugin.yaml, the MCP
 * server's handshake and every skill's metadata — and nothing noticed, because
 * scripts/validate_plugin.py compares only the JSON manifests. This test reads
 * every file that states the PLUGIN version (never the engine version) and fails
 * on the first that disagrees.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = rel => JSON.parse(read(rel));

const EXPECTED = json('package.json').version;

/** Pull one capture group out of a file, failing loudly if the pattern is gone. */
function match(rel, pattern) {
  const found = read(rel).match(pattern);
  assert.ok(found, `${rel}: no version found by ${pattern}`);
  return found[1];
}

function skillFiles() {
  const out = [];
  for (const base of ['skills', '.agents/skills']) {
    for (const name of fs.readdirSync(path.join(ROOT, base))) {
      const rel = `${base}/${name}/SKILL.md`;
      if (fs.existsSync(path.join(ROOT, rel))) out.push(rel);
    }
  }
  return out;
}

function collectVersions() {
  const lock = json('package-lock.json');
  const market = json('.claude-plugin/marketplace.json');
  const listed = (market.plugins || []).find(p => p.name === 'pinescript-plugin') || {};

  const versions = {
    'package-lock.json (root)': lock.version,
    'package-lock.json (packages[""])': (lock.packages || {})['']?.version,
    'plugin.json': json('plugin.json').version,
    'gemini-extension.json': json('gemini-extension.json').version,
    '.claude-plugin/plugin.json': json('.claude-plugin/plugin.json').version,
    '.claude-plugin/marketplace.json (plugins[pinescript-plugin])': listed.version,
    '.kimi-plugin/plugin.json': json('.kimi-plugin/plugin.json').version,
    'plugin.yaml': match('plugin.yaml', /^version:\s*["']?([^"'\s]+)["']?\s*$/m),
    'PLUGIN.md (frontmatter)': match('PLUGIN.md', /^version:\s*["']?([^"'\s]+)["']?\s*$/m),
    'mcp/server.js (Server handshake)': match('mcp/server.js', /name:\s*'pinescript',\s*version:\s*'([^']+)'/),
  };
  for (const rel of skillFiles()) {
    versions[`${rel} (metadata)`] = match(rel, /"pinescript-plugin\/version":\s*"([^"]+)"/);
  }
  return versions;
}

test('package.json carries a SemVer plugin version', () => {
  assert.match(EXPECTED, /^\d+\.\d+\.\d+$/);
});

test('every file that states the plugin version agrees with package.json', () => {
  const versions = collectVersions();
  const skills = Object.keys(versions).filter(k => k.includes('SKILL.md'));
  assert.ok(skills.length >= 8, `expected skills/ and .agents/skills/ SKILL.md files, found ${skills.length}`);

  const wrong = Object.entries(versions)
    .filter(([, v]) => v !== EXPECTED)
    .map(([where, v]) => `  ${where}: ${v} (package.json says ${EXPECTED})`);
  assert.deepStrictEqual(wrong, [], `plugin version drift:\n${wrong.join('\n')}`);
});

test('CHANGELOG.md has an entry for the current version', () => {
  const escaped = EXPECTED.replace(/\./g, '\\.');
  assert.match(read('CHANGELOG.md'), new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'),
    `no "## [${EXPECTED}] - YYYY-MM-DD" heading in CHANGELOG.md`);
});
