# Changelog

All notable changes to the ALDC APM package are documented here. The package
version tracks the canonical
[`ALDC-AL-Development-Collection`](https://github.com/javiarmesto/ALDC-AL-Development-Collection)
release.

## [Unreleased] — setup parity

Close the gap between `apm install` and the legacy npm/VS Code installer.

### Added
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
