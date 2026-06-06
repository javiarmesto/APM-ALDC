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

import { cpSync, existsSync, mkdirSync } from 'node:fs';
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

// Each seed entry: source under seed/, destination under the project root.
const PLAN = [
  { src: 'copilot-instructions.md', dst: '.github/copilot-instructions.md', kind: 'file' },
  { src: 'aldc.yaml', dst: 'aldc.yaml', kind: 'file' },
  { src: 'memory.md', dst: '.github/plans/memory.md', kind: 'file' },
  { src: 'tools/bcquality', dst: 'tools/bcquality', kind: 'dir' },
  { src: 'tools/aldc-validate', dst: 'tools/aldc-validate', kind: 'dir' },
  { src: 'tools/bc-agents', dst: 'tools/bc-agents', kind: 'dir' },
];

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
  cpSync(from, to, { recursive: kind === 'dir' });
  ok(dst);
  seeded++;
}

console.log(`${C.cyan}${'-'.repeat(56)}${C.reset}`);
console.log(`Seeded ${seeded}, skipped ${skipped}. Run 'git status' to review.`);
if (skipped > 0 && !FORCE) console.log(`Re-run with --force to overwrite existing files.`);
