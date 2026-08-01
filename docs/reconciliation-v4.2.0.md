# Reconciliation Report — canonical ALDC v4.2.0 vs APM package

**Date**: 2026-08-01
**Scope**: Handoff `HANDOFF-APM-ALDC-v4.2.0.md`, Step 1 only (reconciliation). No `.apm/` content,
`apm.yml`/`plugin.json` version, or `scripts/build-apm.lock.json` was modified as part of this report —
those are Step "then run build-apm.mjs" (out of scope here, per user decision to plan/execute Step 1 first).

> **Post-report deviation (documented, non-blocking)**: by the time `build-apm.mjs` actually ran
> (Steps 2-7 execution), canonical `main` had advanced from `2ae426d46d5fb808c4ebaa747e9108b0b07c700c`
> (this report's recorded tip) to `a900263f51e416762cc7f85575deb9b30cd5b1e3`. `git diff --stat` between
> the two tips was checked before proceeding: the extra commits only touch `README.md`/banner
> presentation, not any primitive or file scoped by this reconciliation — so every finding and decision
> below remains valid. The actual sync base used by `build-apm.mjs` was `a900263f51e416762cc7f85575deb9b30cd5b1e3`,
> recorded in `scripts/build-apm.lock.json`.

## Sources compared

| Source | Identifier | How accessed |
|---|---|---|
| Canonical tag | `v4.2.0` = commit `0aea659b4e1429ae7ea1663a7557532abf66d67b` | GitHub API (`mcp_github_mcp_s3_get_file_contents`, `ref=refs/tags/v4.2.0`) — no local terminal/git available in this session |
| Canonical main | `main` = commit `2ae426d46d5fb808c4ebaa747e9108b0b07c700c` (tip as of 2026-08-01) | GitHub API, `ref=refs/heads/main` |
| Deployed field snapshot | `C:\ALDC-Forge-Tests\Hogargas\.github` + `aldc.yaml` (read-only reference) | Local `read_file`/`list_dir` |
| Current APM package baseline | `c:\Reactor\APM-ALDC\.apm\*` (synced from canonical ref `16cc1ddaf2c2782249e5f2443fb931ad3995e2a5`, 2026-06-10, per `scripts/build-apm.lock.json`) | Local `read_file`/`list_dir` |

**Method**: for flat/dir categories, compared git blob/tree SHA returned by the GitHub API between tag and
main (identical tree SHA ⇒ guaranteed-identical recursive content, standard git semantics — no need to
recurse into unchanged directories). For the two categories where tag ≠ main, fetched full content and
diffed, then compared against the deployed snapshot and current `.apm/` by direct read.

**Known limitation**: no terminal/git tool was available in this session, so the `git merge-base
--is-ancestor 16cc1dd main` / `... 16cc1dd v4.2.0` ancestry check requested in the plan could **not** be
run. This should be done once an agent with terminal access is available; it is not blocking for the
findings below, which were established directly via content/SHA comparison instead.

## Per-category result (tag v4.2.0 vs main)

| Category | Files/dirs | Result |
|---|---|---|
| `agents/` | 11 (incl. `al-triage.agent.md`, `dredd.agent.md`, `index.md`) | **10/11 identical**. `al-conductor.agent.md` differs (see below). |
| `instructions/` | 11 | Identical (all SHAs match) |
| `prompts/` | 13 | Identical (all SHAs match) |
| `docs/templates/` | 14 | Identical (all SHAs match) |
| `skills/` | 16 canonical `skill-*` dirs + `index.md` | Identical (all **tree** SHAs match ⇒ every file inside every skill, recursively, is identical) |
| `tools/` (`aldc-validate`, `bc-agents`, `bcquality`) | 3 dirs | Identical (tree SHAs match) |
| `.github/copilot-instructions.md` | 1 | Identical (SHA match) |
| `aldc.yaml` | 1 | **Differs** (see below) |

Only **two** primitives differ between the tag and current `main`.

## Finding 1 — `agents/al-conductor.agent.md`

- tag SHA: `da05c3d0a8ad85210216c88f2d4c50e52a523c3c`
- main SHA: `2ea88c6e3106b2264fd53240f89dabf37b6bc48c`
- Diff: main removes a hardcoded `.github/` prefix in one reference —
  tag: `` The 7 always-on instruction micro-rules** (`.github/instructions/al-*.instructions.md`) ``
  main: `` The 7 always-on instruction micro-rules** (`instructions/al-*.instructions.md`) ``
  (Rest of the ~800-line file is identical between tag and main.)
- **Current `c:\Reactor\APM-ALDC\.apm\agents\al-conductor.agent.md`**: already contains the **main**
  wording (`instructions/al-*.instructions.md`), confirmed via direct read.
- **Deployed snapshot `C:\ALDC-Forge-Tests\Hogargas\.github\agents\al-conductor.agent.md`**: does **not**
  contain this phrase at all (older revision, predates this section's current wording) — this snapshot is
  a time-frozen deployment, not a live tracking branch, so it simply reflects an earlier point in canonical
  history. It is **not** a "project customization" in the handoff's three-way-table sense.
- **Decision (per handoff's three-way rule, case "main = ~deployed evidence, differs from tag")**:
  **include** — this is a verified, already-integrated post-tag evolution. No action needed on content
  (already correct in `.apm/`); only the **provenance record** (`scripts/build-apm.lock.json` /
  `apm.yml` version) needs to catch up to reflect that current `.apm/` content matches `main` @
  `2ae426d46d5fb808c4ebaa747e9108b0b07c700c` for this file, not the `16cc1dd` ref currently recorded.

## Finding 2 — `aldc.yaml` (root)

- tag: `core.version: "1.1.0"`, `specFile: "docs/framework/ALDC-Core-Spec-v1.1.md"`
- main: `core.version: "1.2.0"`, `specFile: "docs/framework/ALDC-Core-Spec-v1.2.md"`
- All other sections (`required`/`optional` lists, `external.bcquality`, `contracts`, `validation`) are
  byte-identical between tag and main — only the version banner + spec-file pointer changed.
- **Current APM scaffold seed** (`c:\Reactor\APM-ALDC\.apm\skills\github-scaffold\scripts\seed\aldc.yaml`):
  still `1.1.0` / `ALDC-Core-Spec-v1.1.md` — matches **tag**, not main. This confirms the scaffold seed was
  synced at (or before) the `16cc1dd` baseline and has **not** picked up this main evolution.
- **Deployed snapshot** (`C:\ALDC-Forge-Tests\Hogargas\aldc.yaml`): `1.2.0` / `ALDC-Core-Spec-v1.2.md` —
  matches **main** — **plus** one field the handoff already flagged as an intentional project customization:
  `toolkitRoot: ".github"` (canonical tag and main both have `toolkitRoot: "."`). This is a clean,
  real-world confirmation of the handoff's documented customization and should **not** be adopted verbatim.
- **Decision**: **include** the `1.2.0` / `ALDC-Core-Spec-v1.2.md` version bump as a verified post-tag
  evolution (main = deployed on this point, differs from tag). **Do not** adopt `toolkitRoot: ".github"` —
  that stays a per-project customization, out of scope for the APM-aware `aldc.yaml` transformer (handoff
  Step 2), which must derive `toolkitRoot`-equivalent roots from APM's own split `.github`/`.agents` layout
  instead of copying a single consumer's override.

## Everything else: no reconciliation action needed

All other primitives (10 of 11 agents, all instructions, all prompts, all 14 templates, all 16 canonical
skills recursively, all 3 `tools/` subtrees, `.github/copilot-instructions.md`) are byte-identical between
`v4.2.0` and current `main` — there is nothing to reconcile for these; whatever is in `.apm/` today for
them already reflects the canonical release with no drift risk from this angle.

## Selected canonical commit for the next step (build-apm.mjs run)

Per the handoff's requirement to "record the exact canonical commit used", the reconciliation recommends:

- **Base ref to sync from**: `main` @ `2ae426d46d5fb808c4ebaa747e9108b0b07c700c` (as of 2026-08-01) — it is
  a strict superset of `v4.2.0` content (only the two additive fixes above go beyond the tag; nothing was
  found that regresses or removes tag content).
- This satisfies the handoff's three-way rule row *"main = deployed snapshot, both differ from tag →
  include the verified post-tag canonical evolution, record the exact canonical commit"* for both findings.
- **`scripts/build-apm.lock.json`** should have its `canonicalRef` updated from `16cc1ddaf2c2782249e5f2443fb931ad3995e2a5`
  to `2ae426d46d5fb808c4ebaa747e9108b0b07c700c` once the sync step actually runs (not done in this report).
- **`apm.yml` / `plugin.json`** version should move from `4.1.0` to whatever `package.json.version` resolves
  to at that main commit — confirmed to already read `"4.2.0"` in the local canonical checkout inspected —
  so the expected outcome of the next step is `4.2.0`, matching the handoff's target.

## Deviations / issues encountered during this reconciliation (for the record)

1. No terminal, git, or web-fetch tool was available in this Plan/implementation session; the originally
   planned `git worktree add` approach could not be executed. Worked around by using the GitHub MCP
   `get_file_contents` tool directly against `refs/tags/v4.2.0` and `refs/heads/main` — recommended as the
   preferred method for any future reconciliation pass too (fewer steps than local worktrees, and works
   without a local clone at all).
2. The local canonical clone at `C:\Users\JavierArmestoGonzále\Documents\AL\ALDC` is currently checked out
   on an unrelated branch (`f2-claude-workspace`) — confirmed unused as a comparison source, per plan.
3. `build/aldc-3.2.3`, `build/aldc-3.2.4`, `build/aldc-3.2.6` in this repo were confirmed out of scope
   (legacy artifacts, different versioning scheme) and were not touched.
4. The git ancestry check for `16cc1dd` (is it an ancestor of `main`/`v4.2.0`) could not be run — flagged
   above as a follow-up once terminal access is available. It is not required to trust the findings in this
   report, since those were established by direct content comparison, not by ancestry inference.
5. `scripts/build-apm.mjs`'s `SCAFFOLD_SEED` copies `aldc.yaml` **verbatim** from canonical root. Once Step 2
   of the handoff (APM-aware `aldc.yaml` transformer) is designed, it must start from `main`'s `1.2.0`
   content identified above, not from the currently-seeded `1.1.0` copy — flagged for the next planning pass.

## Explicitly not done in this report

- No file under `.apm/`, `apm.yml`, `plugin.json`, or `scripts/build-apm.lock.json` was modified.
- `build-apm.mjs` was not executed.
- No E2E, scaffold, or validator changes were made — those remain future planning passes per
  `HANDOFF-APM-ALDC-v4.2.0.md` steps 2–7 and the release checklist.
