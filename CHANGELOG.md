# Changelog

All notable changes to the ALDC APM package are documented here. The package
version tracks the canonical
[`ALDC-AL-Development-Collection`](https://github.com/javiarmesto/ALDC-AL-Development-Collection)
release.

## [Unreleased] — EVO-000 release integrity baseline

Make the current 4.2.0 tree reproducible before accepting further evolutives.

### Changed
- Added `scripts/rebuild-distribution.mjs` as the single source + compiled
  regeneration command.
- Encoded Claude Sonnet 5 as the explicit APM-only
  `copilot-model-policy-v1` transformation across 10 agents and 11 prompts.
- Require a clean canonical Git checkout and use its immutable commit timestamp
  in both provenance and the normalized APM lockfile.
- Updated README inventory to the generated counts: 11 agent files, 13 prompt
  files, 11 instruction files, 19 skills, and 14 SDD templates.

### Fixed
- Corrected the `aldc.yaml` instruction transformation for canonical
  `a900263f`: remove the two non-deployed package sources before stripping the
  remaining eight instruction prefixes. A clean regeneration previously failed
  because it expected 9 prefixed paths while canonical contains 10.
- Regenerated `apm.lock.yaml` with the APM 0.27 deployment ledger and content
  hashes.

### Verified
- A second full rebuild produces zero diff.
- `apm audit --ci`: all 10 checks pass, no drift.
- `apm pack --dry-run --verbose`: 109 files.
- Copilot APM archive: 121 verified entries across `.github/{agents,prompts,
  instructions}` and `.agents/skills`; no `.github/commands`, `.claude`,
  `node_modules`, or `docs/templates` paths.
- Root-app and App/Test archive fixtures: first scaffold, idempotent second
  scaffold, scoped `--force`, and ALDC validation all pass with 0 errors and
  0 warnings.

Full evidence and the release decision are recorded in
[`docs/evo-000-release-integrity.md`](docs/evo-000-release-integrity.md).

## [4.2.0] — APM-aware layout, hash-mode entrypoint coherence

Reconcile the APM package with canonical ALDC `main` @ `a900263f` (post-v4.2.0
tag; verified via diff that the extra commits only touch README/banner
content, not any packaged primitive) and close the APM/canonical layout gap
identified after the v4.1.0 release: canonical `aldc.yaml`/`aldc-validate`
assume a single `toolkitRoot` prefix, which cannot express APM's split
Copilot layout (`.github/*` for agents/prompts/instructions vs `.agents/skills/*`
for skills and SDD templates).

### Added
- `build-apm.mjs` step 2d: patches the scaffold-seeded `aldc.yaml` and
  `tools/aldc-validate/index.js` (sync-then-patch, every run, from pristine
  canonical content — never double-patches) to add:
  - A `distribution.roots` block resolving each primitive category
    (`agents`, `subagents`, `workflows`, `skills`, `instructions`, `templates`,
    `tools`) to its actual APM-deployed path.
  - `required.templates` entries rewritten from `docs/templates/<f>` to bare
    `<f>` (resolved against the new `templates` root).
  - Removal of `required.instructions: - "instructions/copilot-instructions.md"`
    — that file is never deployed by the APM instruction integrator (only
    `*.instructions.md` files deploy).
  - A new `copilotEntrypointMode: "hash"` + `copilotEntrypointHash` pin: since
    the full entrypoint source isn't deployed to APM consumers, byte/size
    comparison can't run there — a SHA-256 of the seeded entrypoint is pinned
    instead. **Caveat**: this only catches local drift (hand-edits after
    scaffold), not upstream evolution of the canonical entrypoint.
  - `tools/aldc-validate/index.js` gains a `rootFor(category)` helper that
    resolves each category through `distribution.roots` when present, falling
    back to the legacy `toolkitRoot` prefix otherwise.
- `build-apm.mjs` step 4b: fails the build if any `docs/templates/<name>`
  phantom reference remains in agents/prompts/skills after the runtime-path
  rewrite (step 4).
- `aldc.code-workspace` added to the `github-scaffold` seed and to
  `Install-Scaffold.mjs`. Unlike every other scaffold target it is
  **generated, not copied**: the installer detects the consumer's layout
  (`App/app.json` + `Test/app.json` = split, root `app.json` = simple) and
  produces the matching `folders` array plus the BCQuality root (read from
  the project's `aldc.yaml`).
- Cross-platform `Install-Scaffold.mjs` in the `github-scaffold` skill that
  seeds the non-primitive setup pieces APM does not deploy: the Copilot
  routing entrypoint (`.github/copilot-instructions.md`), `aldc.yaml`,
  `.github/plans/memory.md`, and `tools/{bcquality,aldc-validate,bc-agents}`.
  Idempotent; `--force` to overwrite. Works on Windows, macOS, Linux and Claude
  Code.
- `build-apm.mjs` step 2c: syncs the scaffold `seed/` payload from the canonical
  repo so the setup content never drifts.

### Changed
- `github-scaffold` is now cross-platform: `Install-Scaffold.ps1` is a thin
  wrapper that delegates to the Node installer; `SKILL.md` and `apm.yml`
  `scripts.scaffold` updated accordingly.
- The scaffold no longer seeds `.github/docs/templates/` — templates live solely
  in `skill-sdd-contracts/assets/` (single source of truth).

### Fixed
- `fs.cpSync({recursive: true})` reproducibly crashed the Node process on
  Windows (native access violation, exit `0xC0000409`) even for tiny
  directories. Replaced every recursive-copy call in `build-apm.mjs` and
  `Install-Scaffold.mjs` with a hand-rolled `copyDirSync()` walk
  (`readdirSync` + `mkdirSync` + `copyFileSync`), which also explicitly skips
  `node_modules`/`.git`/`.DS_Store` so local, untracked build artifacts in the
  canonical checkout are never copied into the seed.
- `mustReplace`-style exact-string patches in `build-apm.mjs` now normalize
  `\r\n` → `\n` before matching, since the canonical checkout's `aldc.yaml`
  uses CRLF line endings on Windows.
- `apm.lock.yaml` carried 49 stale `.claude/*` entries (in both
  `local_deployed_files` and `local_deployed_file_hashes`) left over from
  before this repository narrowed to the Copilot-only target. This made
  `apm audit --ci` fail with "49 deployed file(s) missing". Removed the
  stale entries; `apm audit --ci` now passes all 9 checks.
- **Found via E2E fixture testing (see Verified below)**: the seeded
  `aldc.yaml`'s `required.{agents,subagents,workflows,skills,instructions}`
  lists still carried their canonical category-prefix (e.g.
  `"agents/al-architect.agent.md"`, `"skills/skill-api/SKILL.md"`), but
  `distribution.roots` already resolves each category to its final deployed
  folder (e.g. `.github/agents`) — concatenating the two doubled the segment
  (`.github/agents/agents/al-architect.agent.md`), so the validator reported
  every required agent/subagent/workflow/skill/instruction as missing on a
  freshly-installed consumer project. `build-apm.mjs` step 2d now strips the
  category prefix from all five `required.*`/`optional.*` lists (the same
  treatment already applied to `required.templates`).
- **Also found via E2E**: `required.instructions` still listed `"index.md"`
  (a package-level docs index), which — like `copilot-instructions.md` before
  it — is never deployed to a consumer's `.github/instructions/` folder by a
  real `apm install`. Removed it from the seeded list.

### Verified
- Two clean-project E2E fixtures (handoff step 7): a root-app layout
  (`app.json` at project root) and a split layout (`App/app.json` +
  `Test/app.json`), each seeded with the real `apm install`-deployed
  `.github/{agents,prompts,instructions}` + `.agents/skills` content, then
  scaffolded via `Install-Scaffold.mjs` and checked with
  `tools/aldc-validate`. Both layouts are correctly auto-detected
  (`aldc.code-workspace` "simple" vs "split") and, after the two fixes above,
  both report **`ALDC Core v1.1 COMPLIANT (0 warning(s))`** — 0 errors, 0
  warnings.
- `node scripts/build-apm.mjs` — exit 0. agents 11, instructions 11,
  prompts 13, canonicalSkills 16, addonSkills 2, sddTemplates 14,
  runtimeRewrites 12, scaffoldSeed 7/7.
- `apm install` — deploys cleanly, no manual repair needed.
- `apm audit --ci` — **all 9 checks pass** (lockfile-exists, ref-consistency,
  deployed-files-present, no-orphaned-packages, skill-subset-consistency,
  config-consistency, content-integrity, includes-consent, drift).
- `apm pack --dry-run --verbose` — 109 files packed to `build/aldc-4.2.0`;
  no `.claude/*`, no `node_modules`, no phantom `docs/templates/` paths.

## [4.1.0]

Reconcile the APM package with the canonical ALDC v4.1.0 and close the
SDD-templates gap.

### Added
- `scripts/build-apm.mjs` — deterministic generator that regenerates `.apm/`
  from the canonical repo (single source of truth), preserving APM-only add-on
  skills and aligning the version. Provenance recorded in
  `scripts/build-apm.lock.json`.
- `skill-sdd-contracts` skill — bundles the 14 SDD templates as `assets/`,
  loaded Just-In-Time. Replaces the phantom `docs/templates/` path that APM
  never deploys to a consumer project.
- `al-triage` agent (was missing from `.apm/` source).
- `README.md`, `CHANGELOG.md`, `LICENSE` (MIT).

### Changed
- Upgraded all `.apm/` primitives from 3.2.6 → 4.1.0 content (e.g. `skill-api`
  regained the XML-documentation section).
- Promoted `onprem-remote-deploy` from compiled output into `.apm/` source so it
  actually ships to consumers.
- Surgically rewrote the **5 runtime-read** templates (architecture,
  planning-findings, code-review, bcquality-task-context, test-plan) to
  `skill-sdd-contracts/assets/` across the 7 consuming files. The 9
  human-reference templates keep their canonical `docs/templates/` mention.
- `apm.yml` / `plugin.json` version → 4.1.0.

### Removed
- 13 orphaned `bc-*` skill directories from compiled output — leftovers from a
  prior install of a different collection, never part of this package's `.apm/`
  source. The package now matches its source exactly.

### Verified
- `apm install` resolves and deploys cleanly.
- `apm audit` — **No drift detected**.
- `apm pack` — produces a 110-file bundle (`build/aldc-4.1.0`).
