# ALDC — APM package

**AL Development Collection** packaged for [APM](https://github.com/microsoft/apm)
(the Agent Package Manager). ALDC is a skills-based, spec-driven, TDD-orchestrated
framework for developing Microsoft Dynamics 365 **Business Central** extensions
with GitHub Copilot.

> **Using Claude Code?** This package carries the **Copilot** agent prose
> (VS Code AL extension tools: `al_build`, `ms-dynamics-smb.al/*`, `#search`, …).
> The **Claude Code (bare harness)** distribution lives in its own sibling
> package: [`javiarmesto/APM-ALDC---Claude`](https://github.com/javiarmesto/APM-ALDC---Claude)
> (`target: [claude]`), regenerated from the canonical repo's `claude-plugin/`.

This repository is an **APM distribution** of ALDC. It is a *transformation* of the
canonical source — not a fork. The single source of truth is
[`javiarmesto/ALDC-AL-Development-Collection`](https://github.com/javiarmesto/ALDC-AL-Development-Collection);
this repo regenerates its `.apm/` tree from there with `scripts/build-apm.mjs`,
exactly the way the canonical repo regenerates its npm installer and VS Code plugin.

> **Version:** tracks the canonical release (currently **4.1.0**).

> **Next release:** the findings, implementation plan, validation matrix, and
> release criteria for v4.2.0 are captured in
> [`HANDOFF-APM-ALDC-v4.2.0.md`](./HANDOFF-APM-ALDC-v4.2.0.md).

## What's in the package

All primitives live under `.apm/` (the APM source root). `apm install` deploys them
into each harness's runtime directories; the committed `.github/` and
`.agents/` trees are generated output kept for convenience.

| Primitive | Count | Notes |
|-----------|-------|-------|
| **Agents** (`.apm/agents/`) | 10 | 4 public (`al-architect`, `al-developer`, `al-conductor`, `al-presales`) + 3 subagents + `al-triage`, `dredd`, `al-agent-builder` |
| **Skills** (`.apm/skills/`) | 19 | 16 canonical ALDC skills + `skill-sdd-contracts` + 2 APM add-ons (`github-scaffold`, `onprem-remote-deploy`) |
| **Prompts / workflows** (`.apm/prompts/`) | 11 | `al-spec.create`, `al-build`, `al-pr-prepare`, … plus the agent-pack `al-agent.*` |
| **Instructions** (`.apm/instructions/`) | 8 + `copilot-instructions.md` | Auto-applied AL coding standards |
| **SDD templates** | 14 | Shipped as `assets/` of `skill-sdd-contracts` (loaded Just-In-Time) |
| **MCP servers** | 4 | `github`, `markitdown`, `microsoftdocs`, `al-symbols` (declared in `apm.yml`) |

## Consume it

Add ALDC to your project's `apm.yml` (pin to a release tag):

```yaml
dependencies:
  apm:
    - javiarmesto/APM-ALDC#v4.1.0
```

…then install:

```bash
apm install                  # deploys agents, skills, prompts, instructions, MCP
```

Supported `target`: **copilot** only. For Claude Code, depend on
[`javiarmesto/APM-ALDC---Claude`](https://github.com/javiarmesto/APM-ALDC---Claude) instead.

### Project setup after install (scaffold)

`apm install` deploys the ALDC **primitives**. APM 0.27 supports lifecycle
scripts owned and explicitly trusted by the consumer project, but lifecycle scripts
from a dependency are not inherited. Therefore, the non-primitive setup pieces
(Copilot routing entrypoint, `aldc.yaml`, `plans/memory.md`, `tools/`) are seeded by
a cross-platform script shipped in the `github-scaffold` skill. Run it once from
your project root:

```bash
# Copilot / Cursor / Codex (skills land in .agents/skills/)
node .agents/skills/github-scaffold/scripts/Install-Scaffold.mjs
```

It seeds `.github/copilot-instructions.md`, `aldc.yaml`, `.github/plans/memory.md`,
and `tools/{bcquality,aldc-validate,bc-agents}` — skipping anything that already
exists (`--force` to overwrite). The result is equivalent to the legacy npm/VS Code
install. The 14 SDD templates are **not** seeded here — they live in
`skill-sdd-contracts/assets/`.

> Compile is **optional for Copilot** — it reads `.github/instructions/*.instructions.md`
> directly.

## SDD templates — how they resolve

ALDC is spec-driven: agents produce documents from **immutable templates**. In the
canonical repo those live at `docs/templates/`. APM doesn't deploy a `docs/templates/`
folder to a consumer project, so the templates ship instead as **assets of the
`skill-sdd-contracts` skill** (`.apm/skills/skill-sdd-contracts/assets/`).

The build step surgically rewrites only the **5 templates that agents read at
runtime** to that asset path, so they resolve after install:

| Template | Read by |
|----------|---------|
| `architecture-template.md` | `al-architect` |
| `planning-findings-template.md` | `al-planning-subagent` |
| `code-review-template.md` | `al-conductor` |
| `bcquality-task-context.md` | `al-conductor`, `dredd`, `al-review-subagent` |
| `test-plan-template.md` | `skill-testing` |

The other 9 templates are **human-reference only** — their format is already inlined
in the agent/prompt that owns them, and the canonical sources explicitly say *not* to
read them at runtime. They still ship in `assets/` for browsing, keeping their
canonical `docs/templates/` mention untouched.

## Keeping in sync with the canonical repo

The canonical repo is authoritative. **Content changes to primitives go there**, then
this package is regenerated:

```bash
# Clone/checkout the canonical repo at the desired tag, then:
ALDC_CANONICAL=/path/to/ALDC-AL-Development-Collection node scripts/build-apm.mjs
apm install        # regenerate compiled output + lockfile
apm audit          # expect: No drift detected
```

`scripts/build-apm.mjs`:

1. Mirrors canonical `agents/ instructions/ prompts/ skills/` into `.apm/`.
2. Preserves the APM-only add-on skills (`github-scaffold`, `onprem-remote-deploy`).
3. Generates `skill-sdd-contracts` with the 14 SDD templates as `assets/`.
4. Rewrites the 5 runtime template paths to the skill-asset location.
5. Aligns `apm.yml` / `plugin.json` to the canonical version.

The resolved canonical commit is recorded in `scripts/build-apm.lock.json` for
auditability.

### APM-only add-ons (port-back candidates)

`github-scaffold` and `onprem-remote-deploy` currently exist only in this APM package,
not in the canonical repo. They are preserved via an allowlist in `build-apm.mjs`. They
should be **ported back to the canonical repo** so the source of truth stays complete —
tracked as a follow-up.

## Governance (this phase)

- **Versioning** — aligned to the canonical release; tag releases `vX.Y.Z`.
- **Lockfile** — `apm.lock.yaml` is committed (generated by `apm install`).
- **Audit** — `apm audit` reports **No drift detected**. (Info-level findings are
  intentional Unicode such as em-dashes and arrows in the Markdown.)

**Out of scope (phase 2):** CI drift detection (`apm-action`), policy/allowlists,
GitHub rulesets, and signing.

## License

MIT — see [LICENSE](./LICENSE).
