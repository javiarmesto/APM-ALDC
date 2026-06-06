#!/usr/bin/env node

/**
 * build-apm.mjs — Deterministic ALDC → APM source generator
 * ----------------------------------------------------------
 * The canonical repo (javiarmesto/ALDC-AL-Development-Collection) is the single
 * source of truth. This APM package is a *transformation* of that source into
 * APM's `.apm/` layout — exactly like the canonical's `claude-plugin/` is a
 * transformation, regenerated rather than hand-maintained.
 *
 * What it does (idempotent):
 *   1. Mirrors canonical agents/ instructions/ prompts/ skills/ into `.apm/<type>/`.
 *   2. Preserves APM-only add-on skills (allowlist) that have no canonical source.
 *   3. Generates the `skill-sdd-contracts` skill: SKILL.md + all 14 SDD templates
 *      under assets/ (Just-In-Time loadable per the agent-skills convention).
 *   4. Surgically rewrites the *runtime-read* template paths (`docs/templates/<t>`)
 *      to the skill-asset path so they resolve after an APM install — instead of
 *      pointing at a phantom `docs/templates/` that APM never deploys.
 *   5. Bumps apm.yml / plugin.json version to match the canonical release.
 *
 * After running, regenerate the per-harness compiled output with `apm install`.
 *
 * Usage:
 *   ALDC_CANONICAL=/path/to/ALDC-AL-Development-Collection node scripts/build-apm.mjs
 *   (defaults to the sibling directory ../ALDC-AL-Development-Collection)
 *
 * Pin a specific canonical revision by checking that repo out at the desired
 * tag/commit before running; the resolved ref is recorded in build-apm.lock.json.
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const CANONICAL = process.env.ALDC_CANONICAL
  ? resolve(process.env.ALDC_CANONICAL)
  : resolve(REPO, '..', 'ALDC-AL-Development-Collection');
const APM = join(REPO, '.apm');

// ─── Configuration ───────────────────────────────────────────────────────────

// Skills authored only on the APM side (no canonical source). build-apm never
// deletes these. Tracked for port-back to the canonical repo (see README).
const ADDON_SKILLS = ['github-scaffold', 'onprem-remote-deploy'];

// The skill this script generates to host the SDD templates as assets.
const SDD_SKILL = 'skill-sdd-contracts';

// Templates the agents/skills actually READ/COPY/FILL/RENDER at runtime. Their
// path is rewritten to the skill-asset location so it resolves post-install.
// (The other templates ship as assets too, but are human-reference only and
// are explicitly NOT read at runtime, so their canonical path is left intact.)
const RUNTIME_TEMPLATES = [
  'architecture-template.md',     // al-architect (COPY + read/fill)
  'planning-findings-template.md',// al-planning-subagent (reading and filling)
  'code-review-template.md',      // al-conductor (render template)
  'bcquality-task-context.md',    // al-conductor, dredd, al-review-subagent (build per)
  'test-plan-template.md',        // skill-testing (Create … using)
];

const ASSET_BASE = `${SDD_SKILL}/assets`;

// Setup-seed payload for the github-scaffold skill. APM has no automatic
// post-install hook, so the non-primitive setup pieces the npm installer
// seeds (Copilot entrypoint, aldc.yaml, plans/memory.md, tools/) ride inside
// the github-scaffold skill's scripts/seed/ and are deployed by the
// cross-platform Install-Scaffold.mjs the consumer runs after `apm install`.
// build-apm keeps this seed in sync with the canonical repo. Each entry maps a
// canonical source path to a destination under <skill>/scripts/seed/.
const SCAFFOLD_SEED = [
  { from: '.github/copilot-instructions.md', to: 'copilot-instructions.md' },
  { from: 'aldc.yaml', to: 'aldc.yaml' },
  { from: 'docs/templates/memory-template.md', to: 'memory.md' },
  { from: 'tools/bcquality', to: 'tools/bcquality' },
  { from: 'tools/aldc-validate', to: 'tools/aldc-validate' },
  { from: 'tools/bc-agents', to: 'tools/bc-agents' },
];

// ─── Logging ───────────────────────────────────────────────────────────────
const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m', bold: '\x1b[1m' };
const ok = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`);
const info = (m) => console.log(`${C.cyan}${m}${C.reset}`);
const warn = (m) => console.log(`  ${C.yellow}!${C.reset} ${m}`);
const header = (t) => { console.log(`\n${C.cyan}${'═'.repeat(60)}${C.reset}`); console.log(` ${C.bold}${t}${C.reset}`); console.log(`${C.cyan}${'═'.repeat(60)}${C.reset}`); };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

function ensureDir(p) { mkdirSync(p, { recursive: true }); }

function listFiles(dir) {
  return isDir(dir) ? readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()) : [];
}

// Copy every regular file (non-recursive) from src→dst, replacing dst contents
// for that file set. Used for the flat primitive dirs (agents/instructions/prompts).
function syncFlatDir(srcDir, dstDir, label) {
  if (!isDir(srcDir)) throw new Error(`Canonical dir missing: ${srcDir}`);
  ensureDir(dstDir);
  // Remove existing files we manage, then copy fresh.
  for (const f of listFiles(dstDir)) rmSync(join(dstDir, f));
  const files = listFiles(srcDir);
  for (const f of files) cpSync(join(srcDir, f), join(dstDir, f));
  ok(`${label}: ${files.length} files synced`);
  return files;
}

function gitRef(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
}

// ─── Main ──────────────────────────────────────────────────────────────────
header('build-apm — ALDC → APM source generator');
if (!isDir(CANONICAL)) {
  console.error(`${C.red}Canonical repo not found: ${CANONICAL}${C.reset}`);
  console.error('Set ALDC_CANONICAL or place it as a sibling directory.');
  process.exit(1);
}
info(`Canonical source : ${CANONICAL}`);
info(`APM package root : ${REPO}`);

const canonicalPkg = JSON.parse(readFileSync(join(CANONICAL, 'package.json'), 'utf8'));
const VERSION = canonicalPkg.version;
const CANON_REF = gitRef(CANONICAL);
info(`Canonical version: ${VERSION} (${CANON_REF.slice(0, 7)})`);

// 1) Flat primitive dirs ------------------------------------------------------
header('1. Sync agents / instructions / prompts');
const agentFiles = syncFlatDir(join(CANONICAL, 'agents'), join(APM, 'agents'), 'agents');
const instrFiles = syncFlatDir(join(CANONICAL, 'instructions'), join(APM, 'instructions'), 'instructions');
const promptFiles = syncFlatDir(join(CANONICAL, 'prompts'), join(APM, 'prompts'), 'prompts');

// 2) Skills -------------------------------------------------------------------
header('2. Sync skills (recursive)');
const canonicalSkillsDir = join(CANONICAL, 'skills');
const canonicalSkills = readdirSync(canonicalSkillsDir)
  .filter((d) => d.startsWith('skill-') && isDir(join(canonicalSkillsDir, d)));
ensureDir(join(APM, 'skills'));
for (const skill of canonicalSkills) {
  const dst = join(APM, 'skills', skill);
  if (isDir(dst)) rmSync(dst, { recursive: true });
  cpSync(join(canonicalSkillsDir, skill), dst, { recursive: true });
}
ok(`canonical skills: ${canonicalSkills.length} synced`);

// 2b) Add-on skills (preserve / self-heal from compiled output) ---------------
for (const addon of ADDON_SKILLS) {
  const dst = join(APM, 'skills', addon);
  if (isDir(dst)) { ok(`add-on preserved: ${addon}`); continue; }
  // Self-heal: promote from compiled output if it leaked there but isn't sourced.
  const candidates = [join(REPO, '.agents', 'skills', addon), join(REPO, '.claude', 'skills', addon)];
  const src = candidates.find(isDir);
  if (src) { cpSync(src, dst, { recursive: true }); ok(`add-on promoted to source: ${addon} (from ${src.replace(REPO + '/', '')})`); }
  else warn(`add-on declared but no source found: ${addon}`);
}

// 2c) Refresh github-scaffold setup seed from canonical -----------------------
// Keeps the consumer-setup payload (entrypoint, aldc.yaml, memory, tools) in
// sync without touching the hand-authored installer scripts or SKILL.md.
header('2c. Sync github-scaffold setup seed from canonical');
const seedDir = join(APM, 'skills', 'github-scaffold', 'scripts', 'seed');
if (isDir(seedDir)) rmSync(seedDir, { recursive: true });
ensureDir(seedDir);
let seedCount = 0;
for (const { from, to } of SCAFFOLD_SEED) {
  const src = join(CANONICAL, from);
  if (!existsSync(src)) { warn(`seed source missing, skipped: ${from}`); continue; }
  const dst = join(seedDir, to);
  ensureDir(dirname(dst));
  cpSync(src, dst, { recursive: true });
  seedCount++;
}
ok(`scaffold seed: ${seedCount}/${SCAFFOLD_SEED.length} entries synced`);

// 3) skill-sdd-contracts: SKILL.md + assets/<14 templates> --------------------
header('3. Generate skill-sdd-contracts (SDD templates → assets/)');
const sddDir = join(APM, 'skills', SDD_SKILL);
const assetsDir = join(sddDir, 'assets');
if (isDir(sddDir)) rmSync(sddDir, { recursive: true });
ensureDir(assetsDir);
const tplSrc = join(CANONICAL, 'docs', 'templates');
const templates = listFiles(tplSrc).filter((f) => f.endsWith('.md'));
for (const t of templates) cpSync(join(tplSrc, t), join(assetsDir, t));
writeFileSync(join(sddDir, 'SKILL.md'), renderSddSkill(templates));
ok(`${SDD_SKILL}: SKILL.md + ${templates.length} templates in assets/`);

// 4) Surgical runtime path rewrite -------------------------------------------
header('4. Rewrite runtime template paths → skill-asset paths');
const rewriteTargets = [
  ...agentFiles.map((f) => join(APM, 'agents', f)),
  ...promptFiles.map((f) => join(APM, 'prompts', f)),
  ...allSkillMarkdown(join(APM, 'skills')),
].filter((p) => p.endsWith('.md'));

let totalRewrites = 0;
const rewriteReport = {};
for (const file of rewriteTargets) {
  let body = readFileSync(file, 'utf8');
  let fileHits = 0;
  for (const name of RUNTIME_TEMPLATES) {
    // Match optional `.github/` prefix so prior half-rewrites are normalised too.
    const re = new RegExp(`(?:\\.github/)?docs/templates/${name.replace('.', '\\.')}`, 'g');
    body = body.replace(re, () => { fileHits++; return `${ASSET_BASE}/${name}`; });
  }
  if (fileHits > 0) {
    writeFileSync(file, body);
    totalRewrites += fileHits;
    rewriteReport[file.replace(REPO + '/', '')] = fileHits;
  }
}
for (const [f, n] of Object.entries(rewriteReport)) ok(`${f}: ${n} rewrite(s)`);
info(`Total runtime path rewrites: ${totalRewrites}`);

// 5) Version bump -------------------------------------------------------------
header('5. Align version → ' + VERSION);
bumpYamlVersion(join(REPO, 'apm.yml'), VERSION);
bumpJsonVersion(join(REPO, 'plugin.json'), VERSION);
ok(`apm.yml & plugin.json set to ${VERSION}`);

// 6) Provenance lock ----------------------------------------------------------
const lock = {
  generatedAt: new Date().toISOString(),
  canonicalRepo: 'javiarmesto/ALDC-AL-Development-Collection',
  canonicalRef: CANON_REF,
  version: VERSION,
  counts: {
    agents: agentFiles.length,
    instructions: instrFiles.length,
    prompts: promptFiles.length,
    canonicalSkills: canonicalSkills.length,
    addonSkills: ADDON_SKILLS.length,
    sddTemplates: templates.length,
    runtimeRewrites: totalRewrites,
    scaffoldSeed: seedCount,
  },
  runtimeTemplatesRewritten: RUNTIME_TEMPLATES,
  addonSkills: ADDON_SKILLS,
};
writeFileSync(join(__dirname, 'build-apm.lock.json'), JSON.stringify(lock, null, 2) + '\n');

header('Done');
console.log(JSON.stringify(lock.counts, null, 2));
console.log(`\nNext: run ${C.bold}apm install${C.reset} to regenerate compiled output (.github/.claude/.agents), then ${C.bold}apm audit${C.reset}.`);

// ─── Pure helpers ────────────────────────────────────────────────────────────
function allSkillMarkdown(skillsRoot) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (isDir(p)) walk(p);
      else if (e.endsWith('.md')) out.push(p);
    }
  };
  if (isDir(skillsRoot)) walk(skillsRoot);
  return out;
}

function bumpYamlVersion(file, version) {
  const body = readFileSync(file, 'utf8');
  if (!/^version:\s*.+$/m.test(body)) throw new Error(`No version line in ${file}`);
  writeFileSync(file, body.replace(/^version:\s*.+$/m, `version: ${version}`));
}

function bumpJsonVersion(file, version) {
  if (!existsSync(file)) return;
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

function renderSddSkill(templates) {
  const runtime = new Set(RUNTIME_TEMPLATES);
  const rows = templates.slice().sort().map((t) => {
    const kind = runtime.has(t) ? 'runtime' : 'reference';
    return `| \`assets/${t}\` | ${kind} |`;
  }).join('\n');
  return `---
name: ${SDD_SKILL}
description: >-
  Spec-Driven Development (SDD) contract templates for the ALDC framework. Use
  when an ALDC agent or workflow needs the canonical document template for an
  architecture doc, spec, test plan, planning findings, code review render, BCQuality
  task-context, phase/plan completion report, delivery note, or memory file. Loads the
  immutable template from assets/ on demand. Never edit a template in place — copy it
  to the target path and fill it.
---

# Skill: SDD Contract Templates

## Purpose

ALDC is spec-driven: every phase produces a document that follows an **immutable
template**. This skill bundles those 14 templates as \`assets/\` so they travel with
the APM package and resolve after \`apm install\` — instead of living at a
\`docs/templates/\` path that APM never deploys to a consumer project.

Templates are **Just-In-Time** resources: load the specific one only when you are
about to produce its document. Never read all of them at once.

## How agents consume these

Some templates are **read at runtime** (an agent copies/fills/renders them); the
ALDC agents reference those by their asset path \`${ASSET_BASE}/<file>\`. The rest
are **human reference** — their format is already inlined in the agent/prompt that
owns them, so they are bundled here for completeness but are not read during a run.

| Asset | Consumed |
|-------|----------|
${rows}

## Usage rule

1. Identify the document you are about to write (architecture, spec, test plan, …).
2. \`LOAD ${ASSET_BASE}/<template>.md\` — read the matching template from this skill.
3. Copy it to the target path (e.g. \`.github/plans/{req_name}/…\`) and fill every
   section. **Never edit the template in place.**

This file is generated by \`scripts/build-apm.mjs\` from the canonical
\`docs/templates/\` directory. Do not edit it by hand — edit the canonical templates
and re-run the generator.
`;
}
