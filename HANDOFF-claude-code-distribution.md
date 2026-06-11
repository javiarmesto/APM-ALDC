# HANDOFF — Distribute "ALDC for Claude Code" via APM

**Owner handing off:** (this session)
**Goal:** Ship the **Claude Code** distribution of ALDC through **APM** (`javiarmesto/APM-ALDC`) so consumers install it with `apm install`, **without touching the canonical monorepo** for sync (the build script does that).
**Status:** Briefing only — no build/transform changes made yet. One architectural decision must be made first (§3).

---

## 1. The three artifacts in play (so you don't confuse them)

| Artifact | Repo / path | Target runtime | Tool vocabulary |
|---|---|---|---|
| **Copilot-native** | monorepo top-level `agents/ prompts/ instructions/` | GitHub Copilot in VS Code + AL extension | `#search`, `al_build`, `ms-dynamics-smb.al/*`, `vscode/*` |
| **Claude Code plugin** | monorepo `claude-plugin/` | **bare Claude Code harness** (CLI/desktop/marketplace) | `Read/Glob/Grep/Bash/Task` + `al compile` + `al-symbols-mcp`/`context7`/`microsoft-docs` |
| **APM package** | `APM-ALDC` (`.apm/` source → `.claude/`, `.agents/` output) | both `copilot` and `claude` targets | **same as Copilot** (see §3 — this is the catch) |

The plugin was modernized for the bare harness in monorepo PR **#69** (ported #66–#71). That modernization is **not** in the APM package.

## 2. How APM-ALDC works today

- It is a **regenerated transformation** of the canonical monorepo, **not a fork**. Source of truth stays `javiarmesto/ALDC-AL-Development-Collection`.
- `scripts/build-apm.mjs` mirrors canonical **top-level** `agents/ instructions/ prompts/ skills/` into `.apm/` (confirmed: `syncFlatDir(CANONICAL/'agents', …)`), preserves 2 APM-only skills (`github-scaffold`, `onprem-remote-deploy`), ships SDD templates as `skill-sdd-contracts/assets/`, and aligns `apm.yml`/`plugin.json` to the canonical version. Resolved commit pinned in `scripts/build-apm.lock.json`.
- `apm.yml`: `name: aldc`, `version: 4.1.0`, `target: [copilot, claude]`, MCP deps `github / markitdown / microsoftdocs / al-symbols`.
- **Consumer flow** (already documented in `README.md`):
  ```yaml
  # consumer project apm.yml
  dependencies:
    apm:
      - javiarmesto/APM-ALDC#v4.1.0
  ```
  ```bash
  apm install                  # deploys agents/skills/prompts/instructions/MCP
  apm compile --target claude  # generates CLAUDE.md + .claude/rules
  node .claude/skills/github-scaffold/scripts/Install-Scaffold.mjs   # seeds aldc.yaml, plans/memory.md, tools/
  ```

## 3. ⚠️ The decision that gates everything

**APM's current `claude` output is the Copilot agents in APM layout — NOT the modernized bare-harness plugin.**

Evidence: the compiled `.claude/agents/al-developer.md` still has, in its `tools:` frontmatter, `vscode/*`, `ms-dynamics-smb.al/al_debug`, `al_downloadsymbols`, `al_symbolsearch`, `sshadowsdk.al-lsp-for-agents/bclsp_*`, `web/githubTextSearch`, `upstash/context7/*`, `microsoft-learn/*`. Those tools **do not exist in the bare Claude Code harness** — they assume **Claude running inside VS Code with the AL extension + agent-LSP**. `build-apm.mjs` mirrors the Copilot top-level, so the `claude` target inherits that vocabulary.

So "distribute the Claude Code option via APM" forks into two products. **Decide which "Claude" you mean:**

- **Path A — "Claude inside VS Code + AL extension" (status quo).** APM already produces this. It is internally consistent for that environment. **Work: ~none** — tag a release, document. **Risk:** it is *not* the modernized bare-harness plugin; the `tools:` frontmatter is meaningless on the plain Claude Code CLI/desktop.
- **Path B — "bare Claude Code harness" = the modernized `claude-plugin/` (recommended if your Claude users are on the CLI/desktop/marketplace).** Then APM's `claude` target must produce the harness-correct vocabulary (`al compile`, `Grep`, `al-symbols-mcp`, no `#`-vars, no `ms-dynamics-smb`). **Work: extend `build-apm.mjs` (§4).**

> Recommendation: **Path B**, because (a) you just invested in the bare-harness modernization (#69), and (b) APM's value is precisely *no manual sync* — but only if its `claude` output equals the canonical `claude-plugin/`. Path A re-introduces exactly the divergence #69 removed.

## 4. Path B — what to implement (in `APM-ALDC`, monorepo untouched)

Make the `claude` target of `build-apm.mjs` source from the canonical **`claude-plugin/`** instead of the Copilot top-level. Concretely:

1. **Split the mirror by target.** Keep `copilot` ← canonical `agents/ prompts/ instructions/ skills/` (unchanged). Add `claude` ← canonical `claude-plugin/{agents, commands, skills, rules-templates, hooks, .mcp.json}`.
   - `claude-plugin/agents/*.md` → `.apm`/`.claude` agents (already harness-correct vocabulary).
   - `claude-plugin/commands/*.md` → APM prompts / `.claude/commands` (note: monorepo plugin uses `commands/` with `al-spec-create.md` naming; APM uses `prompts/` with `al-spec.create` — reconcile the naming map).
   - `claude-plugin/rules-templates/*` → `.claude/rules` (the auto-applied AL rules).
   - `claude-plugin/hooks/hooks.json`, `.mcp.json` → carry through.
2. **Align MCP in `apm.yml` for the claude target** to the plugin's set: `al-symbols-mcp`, `context7`, `microsoft-docs` (drop `github`/`markitdown` for claude if the plugin doesn't use them). Today `apm.yml` lists `github/markitdown/microsoftdocs/al-symbols` for both.
3. **Skills:** the plugin's `skills/` are already the modernized ones (PR #69 touched 10 skills). Mirror `claude-plugin/skills/` for the claude target so you don't re-inherit Copilot `al_build` prose.
4. **Regenerate & verify:**
   ```bash
   ALDC_CANONICAL=/path/to/ALDC-AL-Development-Collection node scripts/build-apm.mjs
   apm install
   apm audit            # expect: No drift detected
   ```
   **Acceptance check:** `grep -R "al compile\|al-symbols-mcp" .claude/agents/al-developer.md` returns hits and `grep -R "al_build\|ms-dynamics-smb\|#search" .claude/agents/` returns **none**.
5. **Update `scripts/build-apm.lock.json`** (pin canonical commit — should be ≥ the merge of #69, currently `main`).
6. **Tag a release** (`v4.1.x`) and update `README.md` consume section to state which Claude runtime the `claude` target now serves.

## 5. Consumer-facing result (Path B)

```yaml
dependencies:
  apm:
    - javiarmesto/APM-ALDC#v4.1.x
```
```bash
apm install
apm compile --target claude
node .claude/skills/github-scaffold/scripts/Install-Scaffold.mjs
```
→ consumer gets the **modernized bare-harness** agents/commands/skills/rules under `.claude/`, plus `aldc.yaml`, `plans/memory.md`, `tools/`. No marketplace needed; no manual Copilot→Claude sync (build script owns it).

## 6. Open questions for the owner

1. **Which Claude runtime is the audience?** VS Code + AL extension (Path A) or bare Claude Code CLI/desktop (Path B)? This is the only real fork.
2. **APM vs marketplace plugin — both, or APM only?** If APM becomes the Claude channel, do you retire the marketplace-plugin install path, or keep both (they'd share the `claude-plugin/` source under Path B)?
3. **Port-back add-ons:** `github-scaffold` + `onprem-remote-deploy` live only in APM — the README already flags porting them back to canonical. In scope here or separate?
4. **Versioning:** keep APM aligned to canonical `4.1.0`, or let the Claude channel version independently?

## 7. Pointers

- `apm-aldc`: `apm.yml`, `scripts/build-apm.mjs` (mirror logic), `scripts/build-apm.lock.json`, `README.md` (§"Keeping in sync"), compiled `.claude/`.
- monorepo: `claude-plugin/` (the modernized source for Path B), `.github/plans/claude-plugin-tool-modernization.md` (what #69 changed + the tool mapping), `.github/plans/claude-plugin-extraction.md` (the alternative "separate repo" route — APM is the other way to avoid the dual-maintenance, doing it via single-source instead of split).

## 8. Definition of done

- `apm install` + `apm compile --target claude` from a clean consumer project yields working ALDC agents/commands/skills for the **intended** Claude runtime (per §6.1).
- (Path B) acceptance grep in §4.4 passes.
- `apm audit` → No drift; lockfile updated; release tagged; README states the target runtime.
- Canonical monorepo: **unchanged** (source of truth; regeneration is one-way canonical → APM).
