#!/usr/bin/env node
/**
 * Every semantic check's `docAnchor` must resolve to a real heading in a real skill.
 *
 * The anchor is the only bridge between a diagnostic and the prose explaining it. It
 * is also the single most rot-prone field in the system: the engine owns the anchor,
 * this repo owns the heading, and nothing forced them to agree. On 2026-08-08 four of
 * the nine anchors were dead — including S1, the most-cited defect in Pine Script —
 * because headings had been edited to append "detected as **S1**" and no test noticed.
 *
 * The engine's own test asserted `docAnchor.includes('#')`, which four dead links
 * passed. Shape is not resolution. This is the check that had to exist.
 *
 * Slug rules match GitHub's: lowercase, drop everything that is not a word character,
 * space or hyphen, then spaces to hyphens.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const slug = heading =>
  heading.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

let registry;
try {
  ({ SEMANTIC_CHECKS: registry } = require('pinescript-v6-validator'));
} catch (err) {
  console.error('FAIL  cannot load pinescript-v6-validator — run `npm install` first');
  console.error('      ' + err.message);
  process.exit(1);
}

if (!registry || Object.keys(registry).length === 0) {
  console.error('FAIL  the engine exports no SEMANTIC_CHECKS — anchors cannot be checked');
  process.exit(1);
}

const headingsFor = new Map();
function anchorsIn(skill) {
  if (headingsFor.has(skill)) return headingsFor.get(skill);
  const file = path.join(ROOT, 'skills', skill, 'SKILL.md');
  const set = fs.existsSync(file)
    ? new Set(
        fs.readFileSync(file, 'utf8')
          .split('\n')
          .filter(line => /^#{2,6} /.test(line))
          .map(line => slug(line.replace(/^#+\s+/, '')))
      )
    : null;
  headingsFor.set(skill, set);
  return set;
}

const dead = [];
for (const [id, check] of Object.entries(registry)) {
  const [skill, anchor] = String(check.docAnchor || '').split('#');
  const found = anchorsIn(skill);

  if (!found) dead.push(`${id}  no such skill: skills/${skill}/SKILL.md`);
  else if (!anchor) dead.push(`${id}  docAnchor has no '#section': ${check.docAnchor}`);
  else if (!found.has(anchor)) {
    // Name the near-miss — drift is almost always a heading that was reworded.
    const near = [...found].filter(a => {
      const stem = anchor.split('-').filter(w => w.length > 3);
      return stem.length > 0 && stem.every(w => a.includes(w));
    });
    dead.push(
      `${id}  dead anchor: ${check.docAnchor}` +
      (near.length ? `\n      did you mean: ${skill}#${near[0]}` : '')
    );
  }
}

const total = Object.keys(registry).length;
if (dead.length) {
  console.error(`FAIL  ${dead.length}/${total} doc anchors do not resolve\n`);
  for (const line of dead) console.error('  ' + line);
  console.error('\n  Fix the anchor in the ENGINE (packages/validator/src/checkRegistry.ts),');
  console.error('  or restore the heading here. A diagnostic whose explanation 404s is worse');
  console.error('  than one with no link at all.');
  process.exit(1);
}

console.log(`  ${total} doc anchors resolve to real skill headings`);
