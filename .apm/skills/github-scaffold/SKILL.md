---
name: github-scaffold
description: "Seeds the ALDC project setup that apm install does not deploy (Copilot entrypoint, aldc.yaml, plans/memory.md, tools/). Use when initializing a new Business Central project with ALDC, right after apm install, on any OS including Claude Code."
---

# Skill: ALDC Project Scaffold

`apm install` deploys the ALDC **primitives** (agents, skills, prompts,
instructions). It does **not** deploy the non-primitive setup pieces that the
legacy npm/VS Code installer used to seed — APM has no automatic post-install
hook. This skill carries those pieces and a cross-platform installer so you get
a project layout equivalent to the npm install.

## What it seeds

Run from the consumer project root **after `apm install`**. Existing files are
skipped (pass `--force` to overwrite):

| Target | Purpose |
|--------|---------|
| `.github/copilot-instructions.md` | Copilot routing entrypoint (routes to the 4 public agents) |
| `aldc.yaml` | BCQuality / toolkit configuration (project root) |
| `.github/plans/memory.md` | Session-continuity memory file |
| `tools/bcquality`, `tools/aldc-validate`, `tools/bc-agents` | Helper tooling |

The 14 SDD document templates are **not** seeded here — they ship as assets of
the `skill-sdd-contracts` skill (single source of truth) and resolve there.

## Usage

Cross-platform (recommended — Windows, macOS, Linux, Claude Code):

```bash
# Copilot / Cursor / Codex (skills land in .agents/skills/)
node .agents/skills/github-scaffold/scripts/Install-Scaffold.mjs

# Claude Code (skills land in .claude/skills/)
node .claude/skills/github-scaffold/scripts/Install-Scaffold.mjs
```

Windows PowerShell wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/github-scaffold/scripts/Install-Scaffold.ps1
```

Add `--force` (or `-Force`) to overwrite files that already exist.

## Behavior

- Idempotent: re-running skips files that already exist.
- The seed content lives in `scripts/seed/` and is kept in sync with the
  canonical ALDC repo by `scripts/build-apm.mjs`.
