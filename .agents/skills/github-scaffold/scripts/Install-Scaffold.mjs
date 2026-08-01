#!/usr/bin/env node

/**
 * Install-Scaffold.mjs — ALDC consumer setup (cross-platform)
 * -----------------------------------------------------------
 * Seeds the non-primitive ALDC setup pieces that `apm install` does NOT deploy
 * (APM has no automatic post-install hook). Run from the consumer project root
 * after `apm install`. Works on Windows, macOS, and Linux (Claude Code included).
 *
 *   node <skills-dir>/github-scaffold/scripts/Install-Scaffold.mjs [--force]
 *
 * where <skills-dir> is `.agents/skills` (Copilot/Cursor/Codex) or
 * `.claude/skills` (Claude Code) depending on the harness you installed for.
 *
 * Seeds (skips anything that already exists unless --force):
 *   1. .github/copilot-instructions.md   — Copilot routing entrypoint
 *   2. aldc.yaml                         — BCQuality / toolkit config (project root)
 *   3. .github/plans/memory.md           — session-continuity memory file
 *   4. tools/{bcquality,aldc-validate,bc-agents}  — helper tooling
 *
 * Source content lives in the sibling `seed/` directory (kept in sync with the
 * canonical repo by scripts/build-apm.mjs).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SEED = join(SCRIPT_DIR, 'seed');
const PROJECT = resolve(process.cwd());
const FORCE = process.argv.includes('--force');

const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m', bold: '\x1b[1m' };
const ok = (m) => console.log(`  ${C.green}+${C.reset} ${m}`);
const skip = (m) => console.log(`  ${C.yellow}~${C.reset} ${m} (exists, skipped)`);
const miss = (m) => console.log(`  ${C.red}x${C.reset} ${m}`);

// fs.cpSync({recursive:true}) can crash the Node process natively on some
// Windows setups (observed: access violation, exit 0xC0000409) — a hand-rolled
// walk + copyFileSync sidesteps it entirely. See build-apm.mjs for the source.
const COPY_SKIP = new Set(['node_modules', '.git', '.DS_Store']);
function copyDirSync(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (COPY_SKIP.has(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else copyFileSync(s, d);
  }
}

// Each seed entry: source under seed/, destination under the project root.
const PLAN = [
  { src: 'copilot-instructions.md', dst: '.github/copilot-instructions.md', kind: 'file' },
  { src: 'aldc.yaml', dst: 'aldc.yaml', kind: 'file' },
  { src: 'aldc.code-workspace', dst: 'aldc.code-workspace', kind: 'workspace' },
  { src: 'memory.md', dst: '.github/plans/memory.md', kind: 'file' },
  { src: 'tools/bcquality', dst: 'tools/bcquality', kind: 'dir' },
  { src: 'tools/aldc-validate', dst: 'tools/aldc-validate', kind: 'dir' },
  { src: 'tools/bc-agents', dst: 'tools/bc-agents', kind: 'dir' },
];

// aldc.code-workspace is never copied verbatim: canonical ships a single
// root-app layout, but a consumer may be a root-app project OR an AL-Go-style
// App/+Test/ split — so the workspace's `folders` are generated from the
// detected layout instead. The seeded file is only used as a structural base
// (its BCQuality-root entry + `settings` block travel unchanged).
function detectLayout() {
  const hasSplit = existsSync(join(PROJECT, 'App', 'app.json')) || existsSync(join(PROJECT, 'Test', 'app.json'));
  if (hasSplit) return 'split';
  return 'simple'; // root app.json, or no app.json yet (still a safe default)
}

function readBcqualityHome() {
  const aldcYamlPath = join(PROJECT, 'aldc.yaml');
  if (!existsSync(aldcYamlPath)) return '../bcquality';
  const m = readFileSync(aldcYamlPath, 'utf8').match(/home:\s*"([^"]+)"/);
  return m ? m[1] : '../bcquality';
}

function readSeedSettingsBlock(seedWorkspaceText) {
  const m = seedWorkspaceText.match(/"settings":\s*(\{[^}]*\})/);
  return m ? m[1] : '{\n    "git.detectSubmodules": false\n  }';
}

function generateWorkspace(seedWorkspaceText, layout, bcqualityHome) {
  const settingsBlock = readSeedSettingsBlock(seedWorkspaceText);
  const bcqualityFolder = `    {\n      "name": "BCQuality (knowledge \u2014 not compiled)",\n      "path": "${bcqualityHome}"\n    }`;
  const folders = layout === 'split'
    ? [
      '    {\n      "name": "AL (extension)",\n      "path": "App"\n    }',
      '    {\n      "name": "AL (tests)",\n      "path": "Test"\n    }',
      '    {\n      "name": "ALDC (repo: plans, framework, docs)",\n      "path": "."\n    }',
      bcqualityFolder,
    ]
    : [
      '    {\n      "name": "ALDC (extension)",\n      "path": "."\n    }',
      bcqualityFolder,
    ];
  const comment = layout === 'split'
    ? '// Multi-root workspace for ALDC.\n//\n// Root 1 ("AL (extension)") and Root 2 ("AL (tests)") are your AL app/test\n// projects (compiled). Root 3 is this repo root (plans, framework, docs,\n// aldc.yaml) — kept separate so its non-AL files never enter the AL compiler.\n// Root 4 is the BCQuality knowledge base, cloned OUTSIDE the AL project by\n// tools/bcquality/install.sh (default sibling path ../bcquality, override with\n// $BCQUALITY_HOME). Because it has no app.json, the AL compiler never builds\n// it — its example .al files cannot pollute your extension\'s error list. The\n// agents read it from this fourth root.\n//\n// If root 4 shows as missing, run: bash tools/bcquality/install.sh\n// See docs/bcquality.md for the full install + usage guide.\n'
    : '// Multi-root workspace for ALDC.\n//\n// Root 1 is your AL extension (compiled). Root 2 is the BCQuality knowledge\n// base, cloned OUTSIDE the AL project by tools/bcquality/install.sh (default\n// sibling path ../bcquality, override with $BCQUALITY_HOME). Because root 2 has\n// no app.json, the AL compiler never builds it — its example .al files cannot\n// pollute your extension\'s error list. The agents read it from this second root.\n//\n// If root 2 shows as missing, run: bash tools/bcquality/install.sh\n// See docs/bcquality.md for the full install + usage guide.\n';
  return `${comment}{\n  "folders": [\n${folders.join(',\n')}\n  ],\n  "settings": ${settingsBlock}\n}\n`;
}

console.log(`${C.cyan}${'='.repeat(56)}${C.reset}`);
console.log(` ${C.bold}ALDC scaffold — seeding project setup${C.reset}`);
console.log(`${C.cyan}${'='.repeat(56)}${C.reset}`);
console.log(`Project root: ${PROJECT}`);

if (!existsSync(SEED)) {
  miss(`seed/ not found next to this script (${SEED}). Reinstall the package.`);
  process.exit(1);
}

let seeded = 0;
let skipped = 0;
for (const { src, dst, kind } of PLAN) {
  const from = join(SEED, src);
  const to = join(PROJECT, dst);
  if (!existsSync(from)) { miss(`${dst} — seed source missing (${src})`); continue; }
  if (existsSync(to) && !FORCE) { skip(dst); skipped++; continue; }
  mkdirSync(dirname(to), { recursive: true });
  if (kind === 'workspace') {
    const layout = detectLayout();
    const bcqualityHome = readBcqualityHome();
    writeFileSync(to, generateWorkspace(readFileSync(from, 'utf8'), layout, bcqualityHome));
    ok(`${dst} (${layout} layout)`);
  } else {
    if (kind === 'dir') copyDirSync(from, to); else copyFileSync(from, to);
    ok(dst);
  }
  seeded++;
}

console.log(`${C.cyan}${'-'.repeat(56)}${C.reset}`);
console.log(`Seeded ${seeded}, skipped ${skipped}. Run 'git status' to review.`);
if (skipped > 0 && !FORCE) console.log(`Re-run with --force to overwrite existing files.`);
