# Handoff: ALDC APM distribution v4.2.0

## Mission

Release `javiarmesto/APM-ALDC` v4.2.0 as the GitHub Copilot APM distribution of
the canonical `javiarmesto/ALDC-AL-Development-Collection` v4.2.0, preserving
ALDC's Spec-Driven Development (SDD), Test-Driven Development (TDD), and
BCQuality multi-root behavior in a clean consumer project.

The canonical ALDC repository remains the source of truth. This repository is
only a deterministic APM transformation. Do not implement canonical framework
behavior here unless it is strictly APM-specific packaging or bootstrap logic.

## Confirmed findings

1. APM packages agent primitives, not arbitrary project layouts.
2. SDD/TDD templates are not a blocker. APM skills can ship sibling assets, and
   `skill-sdd-contracts` already carries the 14 canonical templates.
3. Five templates are read at runtime and their canonical
   `docs/templates/<name>` references are already rewritten to
   `skill-sdd-contracts/assets/<name>` by `scripts/build-apm.mjs`.
4. Mutable project-owned files must be materialized by a bootstrap step rather
   than treated as APM primitives.
5. `github-scaffold` already seeds `.github/copilot-instructions.md`,
   `aldc.yaml`, `.github/plans/memory.md`, and the ALDC tools.
6. `aldc.code-workspace` exists in canonical ALDC and is referenced by
   `aldc.yaml`, but it is missing from both `SCAFFOLD_SEED` and the scaffold
   installer plan. This leaves the BCQuality multi-root setup incomplete.
7. APM 0.27 supports lifecycle scripts, including `post-install`, but discovers
   them only from policy, user, or the consumer project's `apm.yml`. Lifecycle
   scripts declared by an installed dependency are not inherited.
8. Project lifecycle scripts require explicit `apm lifecycle trust`. Therefore,
   APM-ALDC may ship the bootstrap capability but must not claim that dependency
   installation can execute it automatically.
9. The package currently reports v4.1.0 while canonical ALDC is v4.2.0.
10. The package remains Copilot-only. Claude Code continues to use the sibling
    `javiarmesto/APM-ALDC---Claude` distribution.
11. APM's Copilot layout is split: agents, prompts, and instructions deploy
    under `.github/`, while skills deploy under `.agents/skills/`. The
    canonical `aldc.yaml` and validator assume one `toolkitRoot`, so copying
    them unchanged makes an APM consumer fail conformance even when every
    primitive is installed.
12. `.apm/instructions/copilot-instructions.md` is not deployed by the APM
    instruction integrator because it is not an `*.instructions.md` file. The
    scaffold must provide the trimmed Copilot entrypoint and any source file
    required by coherence validation.

## Real-project reference

A private AL project supplied by the maintainer was inspected as a read-only
integration reference. Do not identify, modify, or copy business content from
that repository as part of this public release.

The following installed framework files were compared with canonical ALDC
`main` and
were byte-identical at handoff preparation time:

- public agents: architect, conductor, and developer
- planning, implementation, and review subagents
- `skill-testing`
- `al-spec.create`
- `.github/copilot-instructions.md`

The project therefore confirms the current canonical SDD/TDD primitive behavior.
It must not become a second source of truth.

Its intentional project-specific differences are:

- `aldc.yaml` uses `toolkitRoot: ".github"`.
- `aldc.code-workspace` contains separate `App`, `Test`, repository-root,
  and BCQuality roots.
- Existing project plans and memory contain live delivery state that must never
  be seeded, replaced, or packaged.

This reference adds a mandatory second consumer layout to the test matrix:

1. a simple AL project with root `app.json`
2. an AL-Go-style project with `App/app.json` and `Test/app.json`

Use a temporary fixture derived from the layout. Never run destructive, force,
or migration tests against the live private reference repository.

## Target architecture

Treat the distribution as two cooperating layers inside the same package.

### Layer 1: ALDC runtime

Deployed by `apm install`:

- agents
- skills
- prompts
- instructions
- MCP declarations
- SDD/TDD templates as Just-In-Time skill assets

### Layer 2: ALDC project bootstrap

Carried by the `github-scaffold` skill and invoked explicitly, or by a trusted
lifecycle entry owned by the consumer project:

- `.github/copilot-instructions.md`
- `aldc.yaml`
- `aldc.code-workspace`
- `.github/plans/memory.md`
- `tools/bcquality`
- `tools/aldc-validate`
- `tools/bc-agents`

Bootstrap output is project-owned after creation. The default behavior must be
idempotent and must not overwrite an existing file. `--force` remains an
explicit opt-in.

### Layer 3: APM deployment profile

The scaffold must materialize an APM-aware `aldc.yaml`, not copy the canonical
file byte-for-byte. It must describe the deployed roots explicitly:

- agents and subagents: `.github/agents`
- workflows: `.github/prompts`
- skills: `.agents/skills`
- instructions: `.github/instructions`
- template assets: `.agents/skills/skill-sdd-contracts/assets`
- project tools: `tools`

Do not solve the split layout by duplicating all skills into
`.github/skills` or by restoring a consumer `.github/docs/templates` tree.
The deployment profile and validator must understand the native APM layout.

## Required implementation

### 1. Sync the canonical v4.2.0 source

Check out canonical ALDC at its v4.2.0 tag or exact release commit and run:

```bash
ALDC_CANONICAL=/path/to/ALDC-AL-Development-Collection node scripts/build-apm.mjs
```

Verify that:

- `.apm/agents`, `.apm/instructions`, `.apm/prompts`, and canonical skills match
  canonical v4.2.0.
- APM-only skills remain preserved.
- `scripts/build-apm.lock.json` records the exact canonical commit.
- `apm.yml` and `plugin.json` are aligned to `4.2.0`.
- Package targeting remains Copilot-only.

Prefer the plural manifest form:

```yaml
targets:
  - copilot
```

Do not merge the Claude-specific distribution back into this package.

### 2. Generate an APM-aware project configuration

Do not seed canonical `aldc.yaml` unchanged. Add a deterministic transformation
or an APM-specific seed derived from canonical configuration.

The resulting consumer `aldc.yaml` must preserve functional configuration,
especially plans, contracts, BCQuality, fallback, and evidence settings, while
pointing conformance checks at the actual APM deployment roots.

Choose one explicit schema and document it. Recommended shape:

```yaml
distribution:
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
```

Update the APM-distributed validator to resolve each primitive category through
these roots. Preserve backward compatibility with canonical/npm installations
that still use `toolkitRoot`.

Adjust the required file entries so paths are relative to their category root,
or implement unambiguous path resolution without double-prefixing. Template
validation must check the 14 skill assets, not a missing
`docs/templates` directory.

Ensure Copilot entrypoint coherence can be validated in the APM layout. Either
seed the full source under a declared APM path or add a validation mode that
verifies the trimmed entrypoint by provenance/hash rather than referring to an
undeployed `instructions/copilot-instructions.md`.

### 3. Complete the scaffold and generate the workspace

In `scripts/build-apm.mjs`, add canonical `aldc.code-workspace` to
`SCAFFOLD_SEED`:

```js
{ from: 'aldc.code-workspace', to: 'aldc.code-workspace' },
```

In `.apm/skills/github-scaffold/scripts/Install-Scaffold.mjs`, add:

```js
{ src: 'aldc.code-workspace', dst: 'aldc.code-workspace', kind: 'file' },
```

Update the script header, skill documentation, README, and changelog so the
declared scaffold output matches the real output.

Do not blindly copy the canonical workspace for every consumer. When the target
does not already have `aldc.code-workspace`, generate it from detected project
layout:

- root `app.json`: add the project root plus BCQuality
- `App/app.json`: add `App`
- `Test/app.json`: add `Test`
- split App/Test: also add repository root for plans, tools, and documentation
- always keep BCQuality external at the path configured by `aldc.yaml`

If a workspace already exists, skip it by default. Never merge folders or
overwrite it implicitly. `--force` may replace it only after the user has
explicitly selected that behavior.

Regenerate the package so the seed, generator, and compiled skill copies contain
the required workspace support. Do not hand-edit generated copies as the source
of truth.

### 4. Keep SDD/TDD templates as skill assets

Retain `skill-sdd-contracts` as the sole APM-distribution source for the 14
templates. Do not seed a second `docs/templates` copy into consumer projects.

Revalidate the five runtime template consumers:

| Template | Runtime consumer |
| --- | --- |
| `architecture-template.md` | `al-architect` |
| `planning-findings-template.md` | `al-planning-subagent` |
| `code-review-template.md` | `al-conductor` |
| `bcquality-task-context.md` | `al-conductor`, `dredd`, `al-review-subagent` |
| `test-plan-template.md` | `skill-testing` |

Fail the build if any runtime consumer still points to a phantom
`docs/templates/<name>` path after transformation.

### 5. Correct lifecycle and consumer guidance

Do not state that APM lacks lifecycle support. State the precise boundary:

- APM 0.27 supports project lifecycle scripts.
- Dependency lifecycle scripts are not inherited by the consumer.
- The universal setup remains an explicit scaffold command.
- A consumer may opt into trusted `post-install` automation in its own
  `apm.yml`.

Document the universal flow:

```bash
apm install javiarmesto/APM-ALDC#v4.2.0 --target copilot
node .agents/skills/github-scaffold/scripts/Install-Scaffold.mjs
```

Also provide an optional consumer-owned lifecycle example:

```yaml
name: my-al-project
version: 1.0.0
targets:
  - copilot
dependencies:
  apm:
    - javiarmesto/APM-ALDC#v4.2.0
lifecycle:
  post-install:
    - type: command
      description: Initialize missing ALDC project files
      command: node .agents/skills/github-scaffold/scripts/Install-Scaffold.mjs
      timeoutSec: 30
```

The documented sequence for this optional mode is:

```bash
apm lifecycle validate
apm lifecycle trust
apm install
```

Make it explicit that lifecycle command failures are isolated by APM and do not
make `apm install` fail. The E2E validation must therefore verify scaffold output
separately.

The package-level `scripts.scaffold` entry is maintainer-local. Do not imply
that dependency scripts are imported into the consumer project's `apm run`
namespace.

### 6. Add deterministic validation

Add or extend package validation to check:

- package version equals canonical version
- canonical commit provenance is present
- all 14 SDD template assets are present
- all five runtime template references resolve after install
- APM-aware `aldc.yaml` resolves the split `.github` / `.agents` layout
- the ALDC validator passes against the native APM deployment
- root-app and App/Test workspaces are generated correctly
- scaffold creates every declared project file
- a second scaffold run changes nothing and skips existing files
- `--force` overwrites only declared scaffold targets
- Copilot is the only package target
- no generated `.claude` distribution is reintroduced
- `apm audit --ci` reports no drift

### 7. Run clean-project and existing-project E2E tests

Use temporary consumers, not this package repository, for validation.

1. Create a minimal root-app consumer `apm.yml` targeting Copilot.
2. Install the local package or packed bundle with APM 0.27.x.
3. Run the scaffold command.
4. Verify all runtime primitives and project-owned files.
5. Open `aldc.code-workspace` and confirm that its project and BCQuality roots
   match the detected layout and `aldc.yaml`.
6. Run the APM-aware ALDC validator and require zero missing-path errors.
7. Repeat steps 1-6 with an `App/` + `Test/` fixture.
8. Create an existing-installation fixture from the inspected framework layout,
   excluding business code, plans, customer documents, credentials, and memory.
9. Verify that scaffold preserves its `aldc.yaml`, workspace, memory, and
   project-specific files without `--force`.
10. Classify any APM collision with existing framework-owned files before using
    `--force`. Only byte-identical or explicitly approved framework files may
    be adopted or replaced.
11. Exercise the minimum workflow:
   `al-architect -> al-spec.create -> al-conductor -> TDD implementation -> review`.
12. Confirm that architecture, specification, test plan, memory, and review
   artifacts can be produced without reading a missing template path.
13. Run `apm audit --ci`.
14. Save the commands and results in the PR description.

Do not require BCQuality to be present for the E2E test to pass. Its absence
must exercise ALDC's documented non-blocking fallback. Add a second scenario
with the BCQuality multi-root mounted when available.

## Files expected to change

At minimum:

- `apm.yml`
- `plugin.json`
- `README.md`
- `CHANGELOG.md`
- `scripts/build-apm.mjs`
- `scripts/build-apm.lock.json`
- `.apm/agents/**`
- `.apm/instructions/**`
- `.apm/prompts/**`
- `.apm/skills/**`
- `.apm/skills/github-scaffold/scripts/seed/aldc.code-workspace`
- APM-aware `aldc.yaml` seed or deterministic config transformer
- APM-aware validator changes and tests
- `.agents/skills/**` and other APM-generated Copilot output
- `apm.lock.yaml`

Only include additional files when regeneration or validation requires them.

## Acceptance criteria

- Package version is `4.2.0` and provenance identifies canonical ALDC v4.2.0.
- `apm install` deploys every ALDC runtime primitive for GitHub Copilot.
- The 14 SDD templates travel as skill assets and load Just-In-Time.
- No runtime-read template reference resolves to a missing path.
- Scaffold creates `aldc.yaml`, `aldc.code-workspace`, Copilot entrypoint,
  global memory, and tools in a clean consumer project.
- The ALDC validator passes with agents/prompts/instructions under `.github`
  and skills/templates under `.agents/skills`.
- Scaffold is idempotent and preserves user-owned files by default.
- Root-app and App/Test workspace layouts are both supported.
- `aldc.yaml` and `aldc.code-workspace` agree on the BCQuality multi-root path.
- An existing ALDC installation retains its project configuration,
  workspace, plans, and memory during non-force adoption.
- Missing BCQuality never blocks review or the E2E test.
- Lifecycle documentation reflects APM 0.27 behavior and its trust boundary.
- Copilot remains the only target in this repository.
- `apm audit --ci` is clean.
- A clean-project SDD/TDD workflow completes without manual path repair.

## Release checklist

1. Review the generated diff and exclude unrelated canonical changes.
2. Run package validation and clean-project E2E tests.
3. Run `apm pack --dry-run --verbose` and inspect the publication set.
4. Run `apm pack --archive` and install the produced archive into a second clean
   consumer project.
5. Run `apm audit --ci` in both producer and consumer validation flows.
6. Update README examples from v4.1.0 to v4.2.0 only when the implementation is
   complete.
7. Complete `CHANGELOG.md` with implemented behavior and verification evidence.
8. Tag `v4.2.0` only after merge and successful validation.

## Non-goals

- Do not change canonical ALDC framework behavior in this repository.
- Do not publish changes to `ALDC-AL-Development-Collection` from this task.
- Do not merge the Claude Code package into the Copilot package.
- Do not duplicate SDD templates under consumer `docs/templates`.
- Do not auto-overwrite project-owned configuration.
- Do not claim dependency-owned lifecycle execution.
- Do not require BCQuality for the core installation to succeed.

## Suggested implementation prompt

> Implement `HANDOFF-APM-ALDC-v4.2.0.md` in this repository. Treat canonical
> `javiarmesto/ALDC-AL-Development-Collection` v4.2.0 as read-only source of
> truth. Work on a feature branch, make only APM distribution and bootstrap
> changes, run the clean-project E2E and audit checks, and open a draft PR with
> exact evidence. Do not modify or publish anything to the canonical ALDC
> repository.
