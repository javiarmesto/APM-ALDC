# HANDOFF — Distribute "ALDC for Claude Code" via APM (`APM-ALDC---Claude`)

**Owner handing off:** (this session)
**Goal:** Ship the **Claude Code** distribution of ALDC through **APM**, mirroring the canonical monorepo's `claude-plugin/` into the dedicated package repo **[`javiarmesto/APM-ALDC---Claude`](https://github.com/javiarmesto/APM-ALDC---Claude)** (already created, empty). The canonical monorepo is **not touched** — propagation is one-way, by build script, exactly like this repo already does for the Copilot flavor.
**Status:** ✅ Implemented — `APM-ALDC---Claude` is regenerated from canonical `claude-plugin/` via its own `scripts/build-apm.mjs`, and this repo is narrowed to `target: [copilot]`. Architecture decided (§3); implementation pending in `APM-ALDC---Claude`.

---

## 1. The artifacts in play (so you don't confuse them)

| Artifact | Repo / path | Target runtime | Tool vocabulary |
|---|---|---|---|
| **Copilot-native** (canonical) | monorepo top-level `agents/ prompts/ instructions/ skills/` | GitHub Copilot in VS Code + AL extension | `#search`, `al_build`, `ms-dynamics-smb.al/*`, `vscode/*` |
| **Claude Code plugin** (canonical) | monorepo `claude-plugin/` | **bare Claude Code harness** (CLI / desktop / marketplace) | `Read/Glob/Grep/Bash/Task` + `al compile` + `al-symbols-mcp`/`context7`/`microsoft-docs` |
| **APM package — Copilot** | `APM-ALDC` (this repo) | Copilot (and "Claude inside VS Code") | same as Copilot-native |
| **APM package — Claude** | **`APM-ALDC---Claude`** (new, empty) | bare Claude Code harness | same as `claude-plugin/` |

The bare-harness plugin was modernized in monorepo PR **#69** (tool prose + sync of #66–#71). That content is the source for `APM-ALDC---Claude`.

## 2. Why TWO sibling APM packages (the verified constraint)

**One APM package cannot ship divergent agent prose per target.** Verified in this repo: the compiled Copilot output (`.github/agents/al-developer.agent.md`) and Claude output (`.claude/agents/al-developer.md`) are **byte-identical** copies of the single `.apm/agents/` source — `apm compile --target claude` only generates context files (CLAUDE.md, rules), it does **not** transform agent prose. Since the Copilot and bare-harness prose genuinely diverge (different tool universes), they need **two packages**.

The model stays clean because both are *regenerated transformations* of the **same canonical monorepo**:

```
ALDC-AL-Development-Collection (canonical, source of truth)
├── top-level (Copilot prose) ──build-apm.mjs──▶ APM-ALDC          (target: [copilot])
└── claude-plugin/ (harness prose) ──build script──▶ APM-ALDC---Claude (target: [claude])
```

No manual sync; no fork; content changes go to the canonical repo, packages regenerate.

## 3. What to build in `APM-ALDC---Claude`

Bootstrap it as a sibling of this repo (same skeleton, different source dir and target):

1. **`scripts/build-apm.mjs`** — copy from this repo and retarget the mirror:
   - Source: canonical **`claude-plugin/`** → `.apm/`:
     - `claude-plugin/agents/*.md` → `.apm/agents/` (already harness-correct).
     - `claude-plugin/commands/*.md` → `.apm/prompts/` — **naming map needed**: plugin uses `commands/al-spec-create.md`; APM prompt convention is `al-spec.create.prompt.md`. Pick one mapping and encode it in the script.
     - `claude-plugin/skills/` → `.apm/skills/` (the modernized skills from #69 — do **not** source the top-level Copilot skills).
     - `claude-plugin/rules-templates/` → the instructions/rules input that `apm compile --target claude` turns into `.claude/rules/`.
     - `claude-plugin/hooks/hooks.json`, `tools/bcquality/` → carry through (hooks already use `${CLAUDE_PLUGIN_ROOT}`-style portability; adapt path variable if APM deploys differently).
   - Keep the add-on allowlist mechanism if you want `github-scaffold` / `onprem-remote-deploy` here too (recommended — the scaffold step is harness-agnostic).
   - Record the canonical commit in `scripts/build-apm.lock.json` (must be ≥ the #69 merge).
2. **`apm.yml`** — `name: aldc` (or `aldc-claude` if APM can't disambiguate two packages with the same name for one consumer — check before publishing), `target: [claude]`, and MCP deps aligned to the plugin's set: `al-symbols-mcp` (npx), `context7` (http), `microsoft-docs` (npx) — **not** the Copilot set (`github`/`markitdown`).
3. **`README.md`** — consume section (see §5) + "Keeping in sync" section pointing at canonical `claude-plugin/`.
4. **Governance** — same as this repo: committed `apm.lock.yaml`, `apm audit` clean, tag releases `vX.Y.Z` aligned to canonical (4.1.0 today).

**And one change in THIS repo (`APM-ALDC`):** narrow `apm.yml` `target: [copilot, claude]` → **`[copilot]`**, and note in the README that the Claude package lives at `APM-ALDC---Claude`. Otherwise consumers keep getting Copilot prose under a `claude` label.

## 4. Acceptance checks

- `ALDC_CANONICAL=<path> node scripts/build-apm.mjs && apm install && apm audit` → No drift.
- `grep -R "al compile\|al-symbols-mcp" .claude/agents/al-developer.md` → **hits**.
- `grep -RE "al_build|ms-dynamics-smb|#search|vscode/" .claude/agents/` → **empty**.
- Fresh consumer project: `apm install` + `apm compile --target claude` + scaffold script → agents/commands/rules present and harness-correct.

## 5. Consumer-facing result

```yaml
# consumer project apm.yml
dependencies:
  apm:
    - javiarmesto/APM-ALDC---Claude#v4.1.0
```
```bash
apm install
apm compile --target claude
node .claude/skills/github-scaffold/scripts/Install-Scaffold.mjs   # seeds aldc.yaml, plans/memory.md, tools/
```

## 6. Relationship to other open work

- **Monorepo extraction plan** (`.github/plans/claude-plugin-extraction.md`, branch `claude/claude-plugin-extraction-plan`): **superseded by this route.** APM-ALDC---Claude achieves the same goals (dedicated Claude repo, clean install, no manual sync) while keeping the canonical monorepo as single source — strictly better than a hard split. Close/annotate that plan when this lands.
- **Marketplace plugin install** (`/plugin marketplace add`): still possible directly from the monorepo's `claude-plugin/` for marketplace users; APM is the package-manager channel. Both share the same canonical source, so keeping both costs nothing.

## 7. Open questions for the owner

1. **Package name in `apm.yml`**: `aldc` (same as Copilot package) vs `aldc-claude` — depends on whether APM resolves dependencies by repo (then same name is fine) or by name (then it must differ). Verify against APM's resolver before tagging.
2. **Add-ons**: include `github-scaffold`/`onprem-remote-deploy` in the Claude package? (Recommended: yes, scaffold is needed for `aldc.yaml`/plans seeding.)
3. **Versioning**: track canonical `4.1.x` (recommended) or version independently.

## 8. Definition of done

- `APM-ALDC---Claude` regenerates from canonical `claude-plugin/` via its own `build-apm.mjs`; lockfile pins the canonical commit.
- Acceptance greps in §4 pass; `apm audit` clean; release tagged.
- `APM-ALDC` narrowed to `target: [copilot]` with a README pointer to the Claude package.
- Canonical monorepo: **unchanged** (one-way regeneration only).
- Monorepo extraction plan annotated as superseded.
