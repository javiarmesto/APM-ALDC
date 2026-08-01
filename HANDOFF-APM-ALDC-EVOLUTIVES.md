# Handoff: APM-ALDC evolutives after 4.2.0

Status: **active**  
Destination: `javiarmesto/APM-ALDC`  
Primary surface: GitHub Copilot  
Prepared: 2026-08-01

## Mission

Evolve APM-ALDC from a working 4.2.0 distribution into a reproducible,
continuously validated delivery channel for canonical ALDC.

Preserve the architecture already implemented:

- canonical ALDC remains the framework source of truth
- APM-ALDC remains a deterministic Copilot distribution, not a framework fork
- SDD/TDD templates travel as Just-In-Time skill assets
- mutable project files are created by an explicit, idempotent scaffold
- APM's split `.github` / `.agents/skills` layout is resolved by
  `distribution.roots`
- Claude Code remains in the sibling APM package

This handoff supersedes the implementation phase in
`HANDOFF-APM-ALDC-v4.2.0.md`. That document remains historical evidence for the
4.2.0 adoption.

## Verified current state

### Implemented 4.2.0 baseline

Commit `792f9d73e94308c559acd65fddd470326d36fab7` records the completed 4.2.0
implementation and the following evidence:

- `apm.yml` and `plugin.json` report `4.2.0`
- canonical provenance points to ALDC commit
  `a900263f51e416762cc7f85575deb9b30cd5b1e3`
- 14 SDD/TDD templates are packaged as skill assets
- all five runtime template families are rewritten and validated
- APM-aware `distribution.roots` resolves the native Copilot layout
- Copilot entrypoint coherence uses a pinned hash in APM consumers
- `aldc.code-workspace` is generated for root-app and `App`/`Test` layouts
- the scaffold is idempotent and preserves project-owned files by default
- `apm audit --ci` passed all 9 checks
- `apm pack --dry-run --verbose` packed 109 files
- root-app and split App/Test fixtures both reported
  `ALDC Core v1.1 COMPLIANT`, with zero errors and zero warnings

### Current main is newer than the validated baseline

Current `main` is commit `8bdf5ec6a33160de71a70c261da0f45536131f57`, one commit after the
validated 4.2.0 baseline.

That commit changes:

- model metadata across 11 agents
- model metadata or guidance across 11 prompts
- the workspace generation logic in both source and compiled scaffold copies
- `apm.lock.yaml`

It does not update `scripts/build-apm.lock.json`, which still records the
canonical `a900263f` generation baseline. Therefore, the current tree may be
functionally correct, but its provenance and full E2E evidence do not yet match
the latest commit.

### Release integrity gaps

At handoff preparation time:

- no Git tag `v4.2.0` exists in the repository
- no GitHub Release exists for 4.2.0
- README installation examples already reference `#v4.2.0`
- README primitive counts are older than the generated counts recorded by the
  4.2.0 build lock and changelog
- draft PR #7 is still open even though its Copilot-only scope was superseded by
  merged PR #6 and the 4.2.0 implementation

Do not begin feature work by assuming `main` is a release-grade baseline. First
close the reproducibility and publication gap below.

## Source authority

Use this order for every primitive:

1. canonical ALDC release tag as the semantic version baseline
2. exact canonical ALDC commit recorded by the generator
3. APM-specific transformations encoded in `scripts/build-apm.mjs`
4. generated `.apm`, `.github`, and `.agents` outputs
5. private deployments as anonymized field evidence only

Manual edits to generated or mirrored primitives are not an accepted long-term
source. If a change is intentionally APM-specific, encode it as a deterministic
transformation or as an explicit APM-owned add-on.

## First milestone: EVO-000 release integrity baseline

### Goal

Make current `main` reproducible and release-ready before accepting another
evolutive.

### Required work

1. Compare `792f9d7..8bdf5ec` and classify every change as:
   - canonical ALDC content
   - APM-specific transformation
   - generated output
   - accidental/manual drift
2. Reconcile the Claude Sonnet 5 agent and prompt changes with current canonical
   ALDC. If they are canonical, regenerate from the exact canonical commit. If
   they are APM-specific, encode and document the transformation.
3. Reconcile the workspace generator change with
   `.apm/skills/github-scaffold/scripts/Install-Scaffold.mjs` as its source and
   regenerate the compiled copy. Do not maintain two hand-edited versions.
4. Update `scripts/build-apm.lock.json` so its canonical reference, timestamp,
   counts, and transformation evidence describe the current package exactly.
5. Regenerate all compiled Copilot output and prove that a second generation
   produces no diff.
6. Run the complete gate against current `main`:
   - `node scripts/build-apm.mjs`
   - `apm audit --ci`
   - `apm pack --dry-run --verbose`
   - archive installation into a clean consumer
   - root-app fixture
   - `App`/`Test` fixture
   - scaffold first run, second idempotent run, and explicit `--force` scope
   - APM-aware ALDC validation
   - no `.claude`, `node_modules`, or phantom `docs/templates` paths
7. Update README primitive counts from generated evidence rather than manual
   recollection.
8. Mark draft PR #7 as superseded or close it after confirming it contains no
   unique work.
9. Record the result in a new `CHANGELOG.md` entry or a release-baseline evidence
   document.

### Tag decision

There is still time to choose the correct 4.2.0 tag target because no tag has
been published.

- Option A: tag the original validated commit `792f9d7` and treat the later
  commit as 4.2.1 or the next release.
- Option B: make current `main` reproducible, repeat the full gate, and tag the
  newly validated commit as 4.2.0.

Recommended: **Option B**, provided EVO-000 passes and the changelog accurately
includes the post-baseline model and workspace changes. Do not create or move a
release tag without explicit maintainer approval.

### EVO-000 acceptance criteria

- current source and compiled output are reproducible from one command
- build provenance matches current package content
- a second build produces zero diff
- all audit, pack, scaffold, and two-layout E2E gates pass
- README counts match generated counts
- the release tag decision is documented
- no stale PR implies an alternative current distribution strategy

## Evolution lanes after EVO-000

### EVO-100: continuous canonical synchronization

Create a workflow that detects canonical ALDC changes and opens a draft sync PR
containing:

- old and new canonical commits
- primitive inventory changes
- template-consumer changes
- transformations applied
- generated diff summary
- required validation matrix

Never auto-merge a canonical sync.

### EVO-110: CI distribution gate

Run on every APM-ALDC pull request:

- deterministic regeneration and zero-diff check
- `apm audit --ci`
- `apm pack --dry-run --verbose`
- source/compiled subset consistency
- Copilot-only target check
- phantom path and forbidden output checks
- root-app and App/Test fixture validation

Keep fixtures synthetic and free of customer or private-project content.

### EVO-120: provenance manifest

Extend provenance beyond a single canonical commit:

- canonical semantic version and exact commit
- hash per packaged primitive
- transformation identifier and version
- APM-owned add-ons and their hashes
- tool versions used for generation and audit

The objective is to explain any packaged file without comparing repositories by
hand.

### EVO-200: scaffold planning and migration

Add safer consumer ergonomics:

- `--dry-run` showing create, skip, replace, and conflict actions
- machine-readable plan output
- explicit migration mode for an existing ALDC installation
- workspace conflict detection without implicit merge
- clear ownership metadata for scaffold-created files

Default behavior must remain non-destructive.

### EVO-210: lifecycle helper

Generate an optional consumer-owned `apm.yml` lifecycle snippet and document its
trust boundary. Do not claim or implement inherited dependency lifecycle
execution.

### EVO-300: Copilot harness compatibility

Maintain a compatibility matrix for:

- GitHub Copilot Chat in VS Code
- GitHub Copilot CLI
- Copilot coding agent
- Agent Skills, custom agents, hooks, plugins, and MCP declarations

Copilot Chat remains the primary ALDC surface until tests prove equivalent CLI
behavior.

The current hard-coded model metadata should become an explicit compatibility
policy. A model rename or availability change must not require uncontrolled
edits across every generated primitive.

### EVO-400: release automation

After the repository has a trusted CI gate, automate preparation but retain a
human release decision:

- version consistency check
- changelog completeness
- archive creation and clean install
- tag target preview
- release notes draft

Do not create a tag or GitHub Release automatically without explicit approval.

## Prioritized backlog

| Priority | ID | Outcome |
| --- | --- | --- |
| P0 | EVO-000 | Reproducible and publishable current baseline |
| P1 | EVO-110 | Mandatory CI gate for every change |
| P1 | EVO-100 | Draft canonical-sync PR automation |
| P1 | EVO-120 | Explainable primitive-level provenance |
| P2 | EVO-200 | Dry-run and safe migration for the scaffold |
| P2 | EVO-300 | Copilot Chat/CLI/coding-agent compatibility matrix |
| P2 | EVO-210 | Consumer-owned lifecycle helper |
| P3 | EVO-400 | Human-approved release automation |

Work on one evolutive at a time. Each item needs its own branch, focused tests,
and draft PR evidence.

## Non-goals

- Do not implement canonical ALDC framework behavior in this distribution.
- Do not modify the canonical ALDC repository from this handoff.
- Do not merge Claude Code prose or output back into this package.
- Do not copy private deployed primitives or identify private repositories.
- Do not auto-overwrite consumer-owned files.
- Do not treat token reduction as success without measuring result quality.
- Do not publish tags, releases, packages, posts, or external messages without
  explicit approval.

## New-conversation starting prompt

> Work in `javiarmesto/APM-ALDC` and implement
> `HANDOFF-APM-ALDC-EVOLUTIVES.md`. Start only with EVO-000. Treat canonical
> ALDC as read-only and APM-ALDC as its deterministic Copilot distribution.
> Reconcile current `main` with canonical provenance, make the complete package
> reproducible, run the full audit/pack/root-app/App-Test E2E gate, and open a
> draft PR with exact evidence. Do not tag or publish a release without my
> explicit approval.

