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
 *   6. Applies and records the APM-specific Copilot model policy.
 *
 * For source + compiled output in one command, run rebuild-distribution.mjs.
 *
 * Usage:
 *   ALDC_CANONICAL=/path/to/ALDC-AL-Development-Collection node scripts/build-apm.mjs
 *   (defaults to the sibling directory ../ALDC-AL-Development-Collection)
 *
 * Pin a specific canonical revision by checking that repo out at the desired
 * tag/commit before running; the resolved ref is recorded in build-apm.lock.json.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync,
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

// APM-ALDC intentionally pins one Copilot model across every invocable agent
// and prompt. This is distribution policy, not canonical ALDC content. Keep it
// here so a canonical regeneration cannot silently discard or partially apply
// the policy (EVO-000).
const COPILOT_MODEL_POLICY = {
  id: 'copilot-model-policy-v1',
  model: 'Claude Sonnet 5 (copilot)',
};

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
  { from: 'aldc.code-workspace', to: 'aldc.code-workspace' },
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

// fs.cpSync({recursive:true}) reproducibly crashes the Node process (native
// access violation, exit 0xC0000409) on this machine/Node v22.20.0 even for
// tiny directories — a hand-rolled walk + copyFileSync sidesteps it entirely.
const COPY_SKIP = new Set(['node_modules', '.git', '.DS_Store']);
function copyDirSync(src, dst) {
  ensureDir(dst);
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (COPY_SKIP.has(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else copyFileSync(s, d);
  }
}

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

function gitCommitTimestamp(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'show', '-s', '--format=%cI', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
}

function gitIsClean(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' }).trim() === '';
  } catch { return false; }
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function applyFrontmatterModelPolicy(files) {
  const changed = [];
  for (const file of files) {
    let body = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (!body.startsWith('---\n')) throw new Error(`Frontmatter missing in ${file}`);

    if (/^model:\s*.+$/m.test(body)) {
      body = body.replace(/^model:\s*.+$/m, `model: ${COPILOT_MODEL_POLICY.model}`);
    } else if (/^agent:\s*.+$/m.test(body)) {
      body = body.replace(/^agent:\s*.+$/m, (line) => `${line}\nmodel: ${COPILOT_MODEL_POLICY.model}`);
    } else {
      throw new Error(`Cannot apply ${COPILOT_MODEL_POLICY.id}; no model or agent key in ${file}`);
    }

    writeFileSync(file, body);
    changed.push(file.replace(REPO + '/', ''));
  }
  return changed;
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
const CANON_TIMESTAMP = gitCommitTimestamp(CANONICAL);
if (CANON_REF === 'unknown' || CANON_TIMESTAMP === 'unknown' || !gitIsClean(CANONICAL)) {
  throw new Error(
    'Canonical source must be a clean Git checkout at an exact commit; '
    + 'dirty or unversioned input would make build provenance false.',
  );
}
info(`Canonical version: ${VERSION} (${CANON_REF.slice(0, 7)})`);

// 1) Flat primitive dirs ------------------------------------------------------
header('1. Sync agents / instructions / prompts');
const agentFiles = syncFlatDir(join(CANONICAL, 'agents'), join(APM, 'agents'), 'agents');
const instrFiles = syncFlatDir(join(CANONICAL, 'instructions'), join(APM, 'instructions'), 'instructions');
const promptFiles = syncFlatDir(join(CANONICAL, 'prompts'), join(APM, 'prompts'), 'prompts');

// 1b) Apply the APM-specific Copilot model policy ----------------------------
header('1b. Apply APM Copilot model policy');
const modelPolicyFiles = applyFrontmatterModelPolicy([
  ...agentFiles.filter((f) => f.endsWith('.agent.md')).map((f) => join(APM, 'agents', f)),
  ...promptFiles.filter((f) => f.endsWith('.prompt.md')).map((f) => join(APM, 'prompts', f)),
]);
ok(`${COPILOT_MODEL_POLICY.id}: ${modelPolicyFiles.length} files set to ${COPILOT_MODEL_POLICY.model}`);

// 2) Skills -------------------------------------------------------------------
header('2. Sync skills (recursive)');
const canonicalSkillsDir = join(CANONICAL, 'skills');
const canonicalSkills = readdirSync(canonicalSkillsDir)
  .filter((d) => d.startsWith('skill-') && isDir(join(canonicalSkillsDir, d)));
ensureDir(join(APM, 'skills'));
for (const skill of canonicalSkills) {
  const dst = join(APM, 'skills', skill);
  if (isDir(dst)) rmSync(dst, { recursive: true });
  copyDirSync(join(canonicalSkillsDir, skill), dst);
}
ok(`canonical skills: ${canonicalSkills.length} synced`);

// 2b) Add-on skills (preserve / self-heal from compiled output) ---------------
for (const addon of ADDON_SKILLS) {
  const dst = join(APM, 'skills', addon);
  if (isDir(dst)) { ok(`add-on preserved: ${addon}`); continue; }
  // Self-heal: promote from compiled output if it leaked there but isn't sourced.
  const candidates = [join(REPO, '.agents', 'skills', addon), join(REPO, '.claude', 'skills', addon)];
  const src = candidates.find(isDir);
  if (src) { copyDirSync(src, dst); ok(`add-on promoted to source: ${addon} (from ${src.replace(REPO + '/', '')})`); }
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
  if (isDir(src)) copyDirSync(src, dst); else copyFileSync(src, dst);
  seedCount++;
}
ok(`scaffold seed: ${seedCount}/${SCAFFOLD_SEED.length} entries synced`);

// 2d) Patch scaffold seed for APM's split Copilot layout -----------------------
// aldc.yaml and tools/aldc-validate are synced verbatim from canonical above,
// every run, from scratch (seedDir is wiped first) — so this patch always
// applies to pristine canonical content, never double-patches. APM's Copilot
// layout is split (.github/* for agents/prompts/instructions, .agents/skills/*
// for skills), which the single canonical `toolkitRoot` prefix cannot express
// (handoff finding #11). Each patch below fails the build loudly if its target
// text isn't found, instead of silently shipping an unpatched file.
header('2d. Patch scaffold seed for APM-aware layout (aldc.yaml + validator)');

function mustReplace(body, file, oldStr, newStr, expectedCount = 1) {
  const actual = body.split(oldStr).length - 1;
  if (actual !== expectedCount) {
    throw new Error(
      `APM seed patch target not found as expected in ${file}: expected ${expectedCount}x `
      + `${JSON.stringify(oldStr.slice(0, 80))}, found ${actual}. Canonical source likely `
      + 'changed shape — update the patch in build-apm.mjs.',
    );
  }
  return body.split(oldStr).join(newStr);
}

// --- aldc.yaml: distribution.roots, template paths, entrypoint hash --------
const seedAldcYamlPath = join(seedDir, 'aldc.yaml');
// Normalize CRLF -> LF: the canonical repo may use either line ending, but the
// patch targets below are written as LF strings. Output is written back as LF.
let aldcYamlBody = readFileSync(seedAldcYamlPath, 'utf8').replace(/\r\n/g, '\n');

const DISTRIBUTION_BLOCK = `distribution:
  kind: apm
  target: copilot
  roots:
    agents: .github/agents
    subagents: .github/agents
    workflows: .github/prompts
    skills: .agents/skills
    instructions: .github/instructions
    templates: .agents/skills/skill-sdd-contracts/assets
    tools: tools
`;
aldcYamlBody = mustReplace(aldcYamlBody, 'aldc.yaml', 'toolkitRoot: "."\n', `toolkitRoot: "."\n\n${DISTRIBUTION_BLOCK}`);

// required.templates: "docs/templates/<f>" -> "<f>" (resolved via the new templates root)
aldcYamlBody = mustReplace(aldcYamlBody, 'aldc.yaml', 'docs/templates/', '', 7);

// required/optional.{agents,subagents}: "agents/<f>" -> "<f>" (rootFor('agents'|'subagents')
// already resolves to the final deployed folder, e.g. ".github/agents" — keeping the
// "agents/" list-item prefix would double it to ".github/agents/agents/<f>").
aldcYamlBody = mustReplace(aldcYamlBody, 'aldc.yaml', '- "agents/', '- "', 10);
// required/optional.workflows: "prompts/<f>" -> "<f>" (rootFor('workflows') = ".github/prompts")
aldcYamlBody = mustReplace(aldcYamlBody, 'aldc.yaml', '- "prompts/', '- "', 11);
// required/optional.skills: "skills/<f>" -> "<f>" (rootFor('skills') = ".agents/skills")
aldcYamlBody = mustReplace(aldcYamlBody, 'aldc.yaml', '- "skills/', '- "', 16);
// copilot-instructions.md and index.md are package-level sources, not files
// deployed by the APM instruction integrator. Remove them before stripping the
// category prefix from the eight deployable required/optional entries.
aldcYamlBody = mustReplace(
  aldcYamlBody, 'aldc.yaml',
  '    - "instructions/copilot-instructions.md"\n',
  '',
);
aldcYamlBody = mustReplace(
  aldcYamlBody, 'aldc.yaml',
  '    - "instructions/index.md"\n\n  templates:',
  '\n  templates:',
);
// required/optional.instructions: "instructions/<f>" -> "<f>" (rootFor('instructions') = ".github/instructions")
aldcYamlBody = mustReplace(aldcYamlBody, 'aldc.yaml', '- "instructions/', '- "', 8);
// optional.tools: "tools/<f>" -> "<f>" (rootFor('tools') = "tools")
aldcYamlBody = mustReplace(aldcYamlBody, 'aldc.yaml', '- "tools/', '- "', 2);

// Copilot entrypoint coherence: the full source (copilotSource) is never
// deployed to APM consumers, so byte/size comparison ("trimmed" mode) can't
// run there. Pin a SHA-256 of the just-seeded trimmed entrypoint instead — this
// catches local drift (hand-edits after scaffold), not upstream evolution.
const seedEntrypointPath = join(seedDir, 'copilot-instructions.md');
const entrypointHash = createHash('sha256').update(readFileSync(seedEntrypointPath, 'utf8').trim(), 'utf8').digest('hex');
aldcYamlBody = mustReplace(
  aldcYamlBody, 'aldc.yaml',
  'copilotEntrypointMode: "trimmed"',
  `copilotEntrypointMode: "hash"\ncopilotEntrypointHash: "${entrypointHash}"`,
);

writeFileSync(seedAldcYamlPath, aldcYamlBody);
ok('aldc.yaml: distribution.roots added, template paths rewritten, entrypoint hash pinned');

// --- tools/aldc-validate/index.js: per-category root + hash coherence mode -
const validatorPath = join(seedDir, 'tools', 'aldc-validate', 'index.js');
let validatorBody = readFileSync(validatorPath, 'utf8').replace(/\r\n/g, '\n');

validatorBody = mustReplace(
  validatorBody, 'aldc-validate/index.js',
  'const root = cfg.toolkitRoot === "." ? "" : cfg.toolkitRoot + "/";',
  [
    'const legacyRoot = cfg.toolkitRoot === "." ? "" : cfg.toolkitRoot + "/";',
    'function rootFor(category) {',
    '  const distRoot = cfg.distribution?.roots?.[category];',
    '  if (distRoot === undefined) return legacyRoot;',
    '  return distRoot === "." ? "" : distRoot + "/";',
    '}',
    'const root = legacyRoot; // back-compat direct uses (AL naming section, etc.)',
  ].join('\n'),
);

validatorBody = mustReplace(validatorBody, 'aldc-validate/index.js', 'const tp = root + t;', 'const tp = rootFor("templates") + t;');
validatorBody = mustReplace(validatorBody, 'aldc-validate/index.js', 'const ap = root + a;', 'const ap = rootFor("agents") + a;');
validatorBody = mustReplace(validatorBody, 'aldc-validate/index.js', 'const sp = root + s;', 'const sp = rootFor("subagents") + s;');
validatorBody = mustReplace(validatorBody, 'aldc-validate/index.js', 'const wp = root + w;', 'const wp = rootFor("workflows") + w;');
validatorBody = mustReplace(validatorBody, 'aldc-validate/index.js', 'const skp = root + sk;', 'const skp = rootFor("skills") + sk;', 2);
validatorBody = mustReplace(validatorBody, 'aldc-validate/index.js', 'const ip = root + i;', 'const ip = rootFor("instructions") + i;');

validatorBody = mustReplace(
  validatorBody, 'aldc-validate/index.js',
  'const yaml = require("js-yaml"); // npm i js-yaml',
  'const yaml = require("js-yaml"); // npm i js-yaml\nconst crypto = require("crypto");',
);

validatorBody = mustReplace(
  validatorBody, 'aldc-validate/index.js',
  '} else if (entrypoint && source) {',
  [
    '} else if (entrypoint && entrypointMode === "hash") {',
    '  if (fileExists(entrypoint)) {',
    '    const ep = readFile(entrypoint).trim();',
    '    const actualHash = crypto.createHash("sha256").update(ep, "utf8").digest("hex");',
    '    const expectedHash = cfg.copilotEntrypointHash;',
    '    if (!expectedHash) {',
    '      issue("copilotEntrypointCoherence", `copilotEntrypointHash not set in aldc.yaml for hash mode`);',
    '    } else if (actualHash !== expectedHash) {',
    '      issue("copilotEntrypointCoherence",',
    '        `Copilot entrypoint hash mismatch (local edit, or scaffold is stale): expected ${expectedHash.slice(0, 12)}\u2026, got ${actualHash.slice(0, 12)}\u2026`);',
    '    } else {',
    '      info("Copilot entrypoint hash matches pinned provenance (no local drift)");',
    '    }',
    '  }',
    '} else if (entrypoint && source) {',
  ].join('\n'),
);

writeFileSync(validatorPath, validatorBody);
ok('aldc-validate/index.js: per-category root resolution + hash coherence mode added');

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

// 4b) Fail-fast: no phantom docs/templates/<runtime-template> refs may remain -
header('4b. Verify no phantom runtime-template paths remain');
const phantomRefs = [];
for (const file of rewriteTargets) {
  const body = readFileSync(file, 'utf8');
  for (const name of RUNTIME_TEMPLATES) {
    if (body.includes(`docs/templates/${name}`)) phantomRefs.push(`${file.replace(REPO + '/', '')} -> docs/templates/${name}`);
  }
}
if (phantomRefs.length > 0) {
  throw new Error(`Phantom runtime-template references remain after rewrite:\n  ${phantomRefs.join('\n  ')}`);
}
ok('No phantom docs/templates/<runtime-template> references remain in agents/prompts/skills');

// 5) Version bump -------------------------------------------------------------
header('5. Align version → ' + VERSION);
bumpYamlVersion(join(REPO, 'apm.yml'), VERSION);
bumpJsonVersion(join(REPO, 'plugin.json'), VERSION);
ok(`apm.yml & plugin.json set to ${VERSION}`);

// 6) Provenance lock ----------------------------------------------------------
const lock = {
  // Deliberately deterministic: wall-clock generation timestamps make two
  // builds from identical inputs differ. This records the immutable source
  // commit time instead.
  generatedAt: CANON_TIMESTAMP,
  timestampBasis: 'canonical-commit',
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
    modelPolicyFiles: modelPolicyFiles.length,
  },
  runtimeTemplatesRewritten: RUNTIME_TEMPLATES,
  addonSkills: ADDON_SKILLS,
  transformations: {
    copilotModelPolicy: {
      id: COPILOT_MODEL_POLICY.id,
      model: COPILOT_MODEL_POLICY.model,
      policySha256: createHash('sha256').update(JSON.stringify(COPILOT_MODEL_POLICY)).digest('hex'),
      files: modelPolicyFiles,
    },
    runtimeTemplatePaths: {
      id: 'runtime-template-assets-v1',
      rewrites: totalRewrites,
      templates: RUNTIME_TEMPLATES,
    },
    apmAwareSeed: {
      id: 'apm-aware-copilot-seed-v1',
      entries: seedCount,
      copilotEntrypointSha256: entrypointHash,
    },
    scaffoldInstaller: {
      source: '.apm/skills/github-scaffold/scripts/Install-Scaffold.mjs',
      sha256: sha256File(join(APM, 'skills', 'github-scaffold', 'scripts', 'Install-Scaffold.mjs')),
    },
  },
};
writeFileSync(join(__dirname, 'build-apm.lock.json'), JSON.stringify(lock, null, 2) + '\n');

header('Done');
console.log(JSON.stringify(lock.counts, null, 2));
console.log(`\nNext: run ${C.bold}node scripts/rebuild-distribution.mjs${C.reset} for source + compiled output, or ${C.bold}apm install${C.reset} if source is already current.`);

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
