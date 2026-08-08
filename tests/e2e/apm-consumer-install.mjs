#!/usr/bin/env node

/**
 * apm-consumer-install.mjs — E2E consumer-installation gate (cross-platform)
 * --------------------------------------------------------------------------
 * Proves that a REAL `apm install` from GitHub deploys this package correctly
 * into a clean consumer project, for the two supported AL layouts:
 *
 *   A. root-app  — `app.json` at the project root
 *   B. split     — AL-Go style `App/app.json` + `Test/app.json`
 *
 * Every fixture is created in an OS temp directory and removed afterwards
 * (set ALDC_E2E_KEEP=1 to keep it for diagnosis). Nothing is written inside
 * this repository. The APM CLI itself is never modified or patched.
 *
 * Environment variables:
 *   ALDC_APM_REF      git ref of the dependency to install (default: main)
 *   ALDC_APM_REPO     owner/name of the package repo (default: javiarmesto/APM-ALDC)
 *   APM_BIN           APM executable (default: apm)
 *   ALDC_E2E_KEEP     1 = keep the temp fixtures and print their paths
 *   ALDC_E2E_WORKDIR  base directory for fixtures (default: os.tmpdir())
 *
 * Trust note: the install runs `apm install --target copilot
 * --trust-transitive-mcp`, which trusts the four MCP servers declared by this
 * package in apm.yml (github-mcp-server, markitdown-mcp, microsoftdocs-mcp,
 * al-symbols-mcp). See docs/testing-apm-consumer-installation.md.
 *
 * Exit code: 0 only if every scenario passes.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

// ─── Configuration ───────────────────────────────────────────────
const APM_BIN = process.env.APM_BIN || 'apm';
const APM_REPO = process.env.ALDC_APM_REPO || 'javiarmesto/APM-ALDC';
const APM_REF = process.env.ALDC_APM_REF || 'main';
const KEEP = process.env.ALDC_E2E_KEEP === '1';
const WORKDIR = process.env.ALDC_E2E_WORKDIR || tmpdir();

// Expected deployment shape (kept in sync with README primitive counts).
const EXPECTED = {
  prompts: 11,
  agents: 11,
  instructions: 8,
  skills: 19,
  scaffoldItems: 7,
};

// The 7 destinations owned by github-scaffold/Install-Scaffold.mjs (its PLAN).
const SCAFFOLD_OWNED = [
  '.github/copilot-instructions.md',
  'aldc.yaml',
  'aldc.code-workspace',
  '.github/plans/memory.md',
  'tools/bcquality',
  'tools/aldc-validate',
  'tools/bc-agents',
];

const FORBIDDEN_PATHS = ['.github/commands', '.claude', 'docs/templates'];

// ─── Small helpers ───────────────────────────────────────────────
const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m' };
const results = [];
let currentChecks = null;

function run(cmd, args, cwd, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32', // resolve apm.cmd / npm.cmd on Windows
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
  if (r.error) throw new Error(`${cmd} failed to spawn: ${r.error.message}`);
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function check(label, cond, detail = '') {
  currentChecks.push({ label, pass: !!cond, detail });
  const mark = cond ? `${C.green}ok${C.reset}` : `${C.red}FAIL${C.reset}`;
  console.log(`    [${mark}] ${label}${detail ? ` ${C.dim}(${detail})${C.reset}` : ''}`);
  return !!cond;
}

function scenario(name, fn) {
  console.log(`\n${C.cyan}${'-'.repeat(64)}${C.reset}\n  ${C.bold}${name}${C.reset}`);
  currentChecks = [];
  let error = null;
  try {
    fn();
  } catch (e) {
    error = e.message || String(e);
    console.log(`    ${C.red}ERROR:${C.reset} ${error}`);
  }
  const pass = !error && currentChecks.length > 0 && currentChecks.every((c) => c.pass);
  results.push({ name, pass, error, checks: currentChecks });
  currentChecks = null;
}

function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function listFiles(dir) {
  return existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)
    : [];
}

function listDirs(dir) {
  return existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
}

// Recursive { relPath: sha256 } snapshot with deterministically sorted keys
// (readdirSync order is not guaranteed across platforms/filesystems, and the
// idempotency scenario compares JSON.stringify of two snapshots).
// `skip` prunes directory names.
function snapshotTree(root, skip = new Set()) {
  const acc = {};
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) acc[relative(root, p).split(sep).join('/')] = sha256File(p);
    }
  })(root);
  return Object.fromEntries(Object.entries(acc).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function findDirsNamed(root, wanted, skip = new Set()) {
  const hits = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = join(dir, entry.name);
      if (wanted.has(entry.name)) hits.push(relative(root, p).split(sep).join('/'));
      if (!skip.has(entry.name)) walk(p);
    }
  })(root);
  return hits;
}

// ─── Fixtures ────────────────────────────────────────────────────
const APP_JSON = (name) => JSON.stringify({
  id: '00000000-0000-0000-0000-00000000000' + (name === 'Test' ? '2' : '1'),
  name: `E2E ${name}`,
  publisher: 'ALDC E2E',
  version: '1.0.0.0',
  platform: '1.0.0.0',
  application: '26.0.0.0',
  idRanges: [{ from: 50100, to: 50149 }],
}, null, 2) + '\n';

const CONSUMER_APM_YML = [
  'name: aldc-consumer-e2e',
  'version: 0.0.0',
  'description: E2E consumer fixture for the ALDC APM package',
  '',
  'target: [copilot]',
  '',
  'dependencies:',
  '  apm:',
  `    - ${APM_REPO}#${APM_REF}`,
  '',
].join('\n');

function makeFixture(base, name, layout) {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'apm.yml'), CONSUMER_APM_YML);
  if (layout === 'simple') {
    writeFileSync(join(dir, 'app.json'), APP_JSON('App'));
  } else {
    mkdirSync(join(dir, 'App'), { recursive: true });
    mkdirSync(join(dir, 'Test'), { recursive: true });
    writeFileSync(join(dir, 'App', 'app.json'), APP_JSON('App'));
    writeFileSync(join(dir, 'Test', 'app.json'), APP_JSON('Test'));
  }
  return dir;
}

// ─── Scenario bodies ─────────────────────────────────────────────
const evidence = { apmVersion: null, resolvedCommit: null };

function scnInstall(fx, label) {
  const r = run(APM_BIN, ['install', '--target', 'copilot', '--trust-transitive-mcp'], fx);
  check('apm install exits 0', r.code === 0, `exit ${r.code}`);
  const commit = r.out.match(/#\S+\s+@([0-9a-f]{7,40})/);
  if (commit) evidence.resolvedCommit = commit[1];
  const repoName = APM_REPO.split('/').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  check('dependency resolved from GitHub', new RegExp(`Resolving .*${repoName}`, 'i').test(r.out) && commit, commit ? `@${commit[1]}` : 'no commit in output');

  const prompts = listFiles(join(fx, '.github', 'prompts'));
  const agents = listFiles(join(fx, '.github', 'agents'));
  const instructions = listFiles(join(fx, '.github', 'instructions'));
  const skills = listDirs(join(fx, '.agents', 'skills'));
  check(`${EXPECTED.prompts} prompts in .github/prompts`, prompts.length === EXPECTED.prompts, `found ${prompts.length}`);
  check('every prompt keeps the .prompt.md extension', prompts.length > 0 && prompts.every((f) => f.endsWith('.prompt.md')));
  check(`${EXPECTED.agents} agent files in .github/agents`, agents.length === EXPECTED.agents, `found ${agents.length}`);
  check(`${EXPECTED.instructions} instruction files in .github/instructions`, instructions.length === EXPECTED.instructions, `found ${instructions.length}`);
  check(`${EXPECTED.skills} skills in .agents/skills`, skills.length === EXPECTED.skills, `found ${skills.length}`);
  check('github-scaffold skill deployed', existsSync(join(fx, '.agents', 'skills', 'github-scaffold', 'scripts', 'Install-Scaffold.mjs')));
  if (r.code !== 0) console.log(r.out);
  console.log(`    ${C.dim}[${label}] deployed from ${APM_REPO}#${APM_REF}${evidence.resolvedCommit ? ` @${evidence.resolvedCommit}` : ''}${C.reset}`);
}

function scnForbiddenPaths(fx) {
  for (const p of FORBIDDEN_PATHS) {
    check(`no ${p}`, !existsSync(join(fx, p)));
  }
  // Prompts must live exclusively in .github/prompts as *.prompt.md.
  const stray = findDirsNamed(join(fx, '.github'), new Set(['commands']));
  check('no commands/ directory anywhere under .github', stray.length === 0, stray.join(', '));
  const phantom = [
    ...findDirsNamed(join(fx, '.github'), new Set(['node_modules', 'templates'])),
    ...findDirsNamed(join(fx, '.agents'), new Set(['node_modules'])),
    // docs/templates must not reappear inside deployed skills either
    ...findDirsNamed(join(fx, '.agents'), new Set(['docs'])).filter((d) => existsSync(join(fx, d, 'templates'))),
  ];
  check('no phantom node_modules / templates inside the deployed distribution', phantom.length === 0, phantom.join(', '));
}

function scnScaffoldFirstRun(fx, expectedLayout) {
  const r = run('node', [join('.agents', 'skills', 'github-scaffold', 'scripts', 'Install-Scaffold.mjs')], fx);
  check('scaffold exits 0', r.code === 0, `exit ${r.code}`);
  check(`scaffold reports "Seeded ${EXPECTED.scaffoldItems}, skipped 0"`, r.out.includes(`Seeded ${EXPECTED.scaffoldItems}, skipped 0`));
  check(`workspace generated with ${expectedLayout} layout`, r.out.includes(`(${expectedLayout} layout)`));
  for (const p of SCAFFOLD_OWNED) {
    check(`created ${p}`, existsSync(join(fx, p)));
  }
  if (r.code !== 0) console.log(r.out);
}

function scnIdempotency(fx) {
  const before = {};
  for (const p of SCAFFOLD_OWNED) {
    const full = join(fx, p);
    before[p] = statSync(full).isDirectory()
      ? JSON.stringify(snapshotTree(full, new Set(['node_modules'])))
      : readFileSync(full, 'utf8');
  }
  const r = run('node', [join('.agents', 'skills', 'github-scaffold', 'scripts', 'Install-Scaffold.mjs')], fx);
  check('second scaffold run exits 0', r.code === 0, `exit ${r.code}`);
  check(`reports "Seeded 0, skipped ${EXPECTED.scaffoldItems}"`, r.out.includes(`Seeded 0, skipped ${EXPECTED.scaffoldItems}`));
  for (const p of SCAFFOLD_OWNED) {
    const full = join(fx, p);
    const after = statSync(full).isDirectory()
      ? JSON.stringify(snapshotTree(full, new Set(['node_modules'])))
      : readFileSync(full, 'utf8');
    check(`${p} unchanged`, after === before[p]);
  }
}

function scnForceScope(fx) {
  const entrypoint = join(fx, '.github', 'copilot-instructions.md');
  const seedEntrypoint = join(fx, '.agents', 'skills', 'github-scaffold', 'scripts', 'seed', 'copilot-instructions.md');
  const consumerFile = join(fx, 'CONSUMER-OWNED.md');

  // Arrange: tamper a scaffold-owned file, add a consumer-owned file,
  // record the app.json hash, and snapshot the whole fixture.
  writeFileSync(entrypoint, '# TAMPERED by e2e — must be restored by --force\n');
  writeFileSync(consumerFile, 'This file belongs to the consumer project.\n');
  const appJsonPath = existsSync(join(fx, 'app.json')) ? join(fx, 'app.json') : join(fx, 'App', 'app.json');
  const appJsonHashBefore = sha256File(appJsonPath);
  // .vscode stays IN the snapshot on purpose: apm install writes mcp.json
  // there, and this scenario must prove the scaffold never touches it.
  const skip = new Set(['node_modules', 'apm_modules']);
  const treeBefore = snapshotTree(fx, skip);

  const r = run('node', [join('.agents', 'skills', 'github-scaffold', 'scripts', 'Install-Scaffold.mjs'), '--force'], fx);
  check('scaffold --force exits 0', r.code === 0, `exit ${r.code}`);
  check(`--force reports "Seeded ${EXPECTED.scaffoldItems}, skipped 0"`, r.out.includes(`Seeded ${EXPECTED.scaffoldItems}, skipped 0`));

  // Scaffold-owned file restored to the deployed seed content. Two hashes
  // describe the same restored file (see docs): raw file bytes (what
  // apm.lock.yaml records as content_hash) vs trimmed text (what aldc.yaml
  // pins as copilotEntrypointHash).
  const restored = readFileSync(entrypoint, 'utf8');
  check('.github/copilot-instructions.md restored from seed', restored === readFileSync(seedEntrypoint, 'utf8'));
  const rawHash = sha256File(entrypoint);
  const trimmedHash = createHash('sha256').update(restored.trim(), 'utf8').digest('hex');
  console.log(`    ${C.dim}entrypoint raw-bytes sha256    : ${rawHash}${C.reset}`);
  console.log(`    ${C.dim}entrypoint trimmed-text sha256 : ${trimmedHash}${C.reset}`);
  const aldcYaml = readFileSync(join(fx, 'aldc.yaml'), 'utf8');
  const pinned = aldcYaml.match(/copilotEntrypointHash:\s*"([0-9a-f]{64})"/);
  check('restored entrypoint matches the copilotEntrypointHash pinned in aldc.yaml', pinned && pinned[1] === trimmedHash, pinned ? `${pinned[1].slice(0, 12)}…` : 'pin not found');

  // Consumer-owned content is untouched.
  check('app.json intact after --force', sha256File(appJsonPath) === appJsonHashBefore);
  check('consumer-owned file intact after --force', readFileSync(consumerFile, 'utf8') === 'This file belongs to the consumer project.\n');

  // Nothing outside the scaffold's 7 declared destinations changed.
  const treeAfter = snapshotTree(fx, skip);
  const inScope = (p) => SCAFFOLD_OWNED.some((owned) => p === owned || p.startsWith(owned + '/'));
  const outOfScope = [];
  for (const [p, h] of Object.entries(treeAfter)) {
    if (treeBefore[p] !== h && !inScope(p)) outOfScope.push(p);
  }
  for (const p of Object.keys(treeBefore)) {
    if (!(p in treeAfter) && !inScope(p)) outOfScope.push(`${p} (deleted)`);
  }
  check('no writes outside the 7 scaffold-owned destinations', outOfScope.length === 0, outOfScope.join(', '));
}

function scnValidate(fx, layout) {
  // The validator needs js-yaml (declared in its own package.json).
  const validatorDir = join(fx, 'tools', 'aldc-validate');
  if (!existsSync(validatorDir)) {
    throw new Error('tools/aldc-validate not present — scaffold did not run (earlier scenario failed)');
  }
  if (!existsSync(join(validatorDir, 'node_modules'))) {
    let dep = run('npm', ['ci', '--no-audit', '--no-fund'], validatorDir);
    if (dep.code !== 0) dep = run('npm', ['install', '--no-audit', '--no-fund'], validatorDir);
    check('validator dependencies installed (js-yaml)', dep.code === 0, `exit ${dep.code}`);
  }

  const workspace = readFileSync(join(fx, 'aldc.code-workspace'), 'utf8');
  if (layout === 'simple') {
    check('workspace has the root-app folder ("ALDC (extension)" → .)', workspace.includes('"ALDC (extension)"') && workspace.includes('"path": "."'));
    check('workspace has no App/Test folders', !workspace.includes('"path": "App"') && !workspace.includes('"path": "Test"'));
  } else {
    check('workspace is multi-root: App folder present', workspace.includes('"AL (extension)"') && workspace.includes('"path": "App"'));
    check('workspace is multi-root: Test folder present', workspace.includes('"AL (tests)"') && workspace.includes('"path": "Test"'));
    check('workspace keeps the repo-root folder', workspace.includes('"path": "."'));
  }
  check('workspace includes the BCQuality knowledge root', workspace.includes('BCQuality'));

  const r = run('node', [join('tools', 'aldc-validate', 'index.js')], fx);
  const compliant = r.out.match(/ALDC Core v[\d.]+ COMPLIANT \((\d+) warning\(s\)\)/);
  check('validator exits 0 (0 errors)', r.code === 0, `exit ${r.code}`);
  check('validator reports ALDC Core v1.1 COMPLIANT', /ALDC Core v1\.1 COMPLIANT/.test(r.out), compliant ? compliant[0] : 'no COMPLIANT line');
  check('validator reports 0 warnings', compliant && compliant[1] === '0', compliant ? `${compliant[1]} warning(s)` : '');
  if (r.code !== 0) console.log(r.out);
}

// ─── Main ────────────────────────────────────────────────────────
console.log(`${C.cyan}${'='.repeat(64)}${C.reset}`);
console.log(` ${C.bold}ALDC APM consumer-install E2E${C.reset}`);
console.log(`${C.cyan}${'='.repeat(64)}${C.reset}`);

const versionProbe = run(APM_BIN, ['--version'], process.cwd());
if (versionProbe.code !== 0) {
  console.error(`Cannot run "${APM_BIN} --version" — install the APM CLI or set APM_BIN.`);
  process.exit(2);
}
evidence.apmVersion = versionProbe.out.trim();
console.log(` APM        : ${evidence.apmVersion}`);
console.log(` Dependency : ${APM_REPO}#${APM_REF}`);
console.log(` Node       : ${process.version}`);

mkdirSync(WORKDIR, { recursive: true }); // ALDC_E2E_WORKDIR may not exist yet
const base = mkdtempSync(join(WORKDIR, 'aldc-apm-e2e-'));
console.log(` Fixtures   : ${base}${KEEP ? ' (kept — ALDC_E2E_KEEP=1)' : ''}`);

try {
  const fxRoot = makeFixture(base, 'root-app', 'simple');
  const fxSplit = makeFixture(base, 'split-app-test', 'split');

  // Fixture A: root app.json
  scenario('1a. apm install — root-app fixture', () => scnInstall(fxRoot, 'root-app'));
  scenario('7a. Copilot path regression — root-app fixture', () => scnForbiddenPaths(fxRoot));
  scenario('2. scaffold first run (root-app)', () => scnScaffoldFirstRun(fxRoot, 'simple'));
  scenario('3. scaffold idempotency (second run, no --force)', () => scnIdempotency(fxRoot));
  scenario('4. --force scope (restore owned, preserve consumer)', () => scnForceScope(fxRoot));
  scenario('5. root-app workspace + ALDC validator', () => scnValidate(fxRoot, 'simple'));

  // Fixture B: App/ + Test/
  scenario('1b. apm install — App/Test fixture', () => scnInstall(fxSplit, 'split'));
  scenario('7b. Copilot path regression — App/Test fixture', () => scnForbiddenPaths(fxSplit));
  scenario('2b. scaffold first run (App/Test)', () => scnScaffoldFirstRun(fxSplit, 'split'));
  scenario('6. App/Test workspace + ALDC validator', () => scnValidate(fxSplit, 'split'));
} finally {
  if (!KEEP) {
    rmSync(base, { recursive: true, force: true });
  }
}

// ─── Summary ─────────────────────────────────────────────────────
console.log(`\n${C.cyan}${'='.repeat(64)}${C.reset}`);
console.log(` ${C.bold}Summary${C.reset}  (APM ${evidence.apmVersion || '?'} · ${APM_REPO}#${APM_REF}${evidence.resolvedCommit ? ` @${evidence.resolvedCommit}` : ''})`);
let failures = 0;
for (const s of results) {
  const mark = s.pass ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
  if (!s.pass) failures++;
  console.log(`  [${mark}] ${s.name}${s.error ? ` — ${s.error}` : ''}`);
}
console.log(`${C.cyan}${'='.repeat(64)}${C.reset}`);
if (KEEP) console.log(`Fixtures kept at: ${base}`);
if (failures > 0) {
  console.log(`${C.red}${failures} scenario(s) failed.${C.reset}`);
  process.exit(1);
}
console.log(`${C.green}All ${results.length} scenarios passed.${C.reset}`);
