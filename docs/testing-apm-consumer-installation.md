# Testing a real APM consumer installation

This guide describes the repeatable E2E gate that proves a **real `apm install`
from GitHub** deploys this package correctly into a clean consumer project, for
the two supported AL layouts (root `app.json`, and AL-Go style `App/` + `Test/`).

The runner is [`tests/e2e/apm-consumer-install.mjs`](../tests/e2e/apm-consumer-install.mjs).
A step-by-step **manual walkthrough of the same scenario (in Spanish)** is
available in [`guia-usuario-pruebas-instalacion.md`](./guia-usuario-pruebas-instalacion.md).
It creates its fixtures in an OS temp directory, never writes inside this
repository, never patches the APM CLI, and removes the fixtures when it
finishes (unless you ask it to keep them).

## Prerequisites

- **Node.js 18+** (validated with Node 22).
- **npm** on PATH — the deployed `tools/aldc-validate` declares `js-yaml` in its
  own `package.json`; the runner installs it inside each fixture.
- **APM CLI 0.27.0** (the version this repo's evidence is recorded against;
  `pip install apm-cli==0.27.0` is the quickest cross-platform route — see the
  [APM CLI repo](https://github.com/danielmeppiel/apm) for the install scripts
  and other package managers). Newer versions may work; record the actual
  version you run, which the runner prints in its summary.
- **Network access** to `github.com` (dependency resolution) and
  `registry.npmjs.org` (the validator's `js-yaml`).
- **`gh` CLI is not required.** `javiarmesto/APM-ALDC` is public, and the
  validated run resolved it without any GitHub authentication. For private
  sources or if you hit API rate limits, configure a GitHub token per the APM
  CLI documentation.

## The MCP trust decision — read before running

The install command the runner executes is:

```bash
apm install --target copilot --trust-transitive-mcp
```

`--trust-transitive-mcp` means you are **explicitly trusting the four MCP
servers declared by ALDC** in `apm.yml`, which APM then configures for VS Code
(`.vscode/mcp.json` in the fixture):

| MCP server | Transport | What gets configured |
|------------|-----------|----------------------|
| `github-mcp-server` | http | `https://api.githubcopilot.com/mcp/` |
| `markitdown-mcp` | stdio | `uvx markitdown-mcp@0.0.1a4` |
| `microsoftdocs-mcp` | http | `https://learn.microsoft.com/api/mcp` |
| `al-symbols-mcp` | stdio | `npx al-mcp-server` |

The tests only verify that the servers are *configured* — none of them is ever
executed. If you do not accept this trust decision, run the install step
manually without the flag and answer APM's interactive trust prompts yourself.

## Quick start

```bash
node tests/e2e/apm-consumer-install.mjs
```

Exit code `0` means every scenario passed; anything else means at least one
check failed (the summary lists which).

## Detailed execution and variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ALDC_APM_REF` | `main` | Git ref of the dependency to install (`main`, a branch, or a future tag such as `v4.2.0`) |
| `ALDC_APM_REPO` | `javiarmesto/APM-ALDC` | Package repository to install from (useful for testing a fork) |
| `APM_BIN` | `apm` | APM executable (absolute path or alternative binary) |
| `ALDC_E2E_KEEP` | unset | `1` keeps the temp fixtures and prints their path |
| `ALDC_E2E_WORKDIR` | OS temp dir | Base directory in which fixtures are created |

Examples:

```bash
# Test a feature branch of the package
ALDC_APM_REF=my-branch node tests/e2e/apm-consumer-install.mjs

# Use a specific APM binary and keep fixtures for inspection
APM_BIN=~/.local/bin/apm ALDC_E2E_KEEP=1 node tests/e2e/apm-consumer-install.mjs
```

## Scenario matrix

Two fixtures are created from scratch on every run:

- **root-app** — consumer `apm.yml` + `app.json` at the fixture root.
- **split-app-test** — consumer `apm.yml` + `App/app.json` + `Test/app.json`.

| # | Scenario | Fixture | Expected result |
|---|----------|---------|-----------------|
| 1a/1b | Real `apm install` from GitHub | both | Exit 0; 11 prompts in `.github/prompts` (all `*.prompt.md`), 11 agent files in `.github/agents`, 8 instruction files in `.github/instructions`, 19 skills in `.agents/skills`; resolved commit captured from APM output |
| 7a/7b | Copilot path regression | both | No `.github/commands`, no `.claude`, no `docs/templates`; no `commands/` anywhere under `.github`; no phantom `node_modules`/`templates` inside the deployed distribution |
| 2/2b | Scaffold first run | both | `Seeded 7, skipped 0`; the 7 scaffold-owned items exist (`.github/copilot-instructions.md`, `aldc.yaml`, `aldc.code-workspace`, `.github/plans/memory.md`, `tools/bcquality`, `tools/aldc-validate`, `tools/bc-agents`); workspace generated with `simple` / `split` layout respectively |
| 3 | Idempotency (second run, no `--force`) | root-app | `Seeded 0, skipped 7`; content hashes of all 7 items unchanged |
| 4 | `--force` scope | root-app | Tampered `.github/copilot-instructions.md` restored byte-identical to the deployed seed; `app.json` and a consumer-owned file intact; **no file outside the 7 scaffold-owned destinations changed** (full-tree hash diff) |
| 5 | Root-app workspace + validator | root-app | Workspace has `"ALDC (extension)" → "."` (no `App`/`Test` folders) plus the BCQuality root; `ALDC Core v1.1 COMPLIANT`, exit 0 (0 errors), 0 warnings |
| 6 | App/Test workspace + validator | split | Multi-root workspace with `App`, `Test`, repo root, and BCQuality folders; `ALDC Core v1.1 COMPLIANT`, exit 0 (0 errors), 0 warnings |

All counts are read from the real files deployed on disk — the runner never
trusts APM's console output for them. The validator's compliance line is
`✅ ALDC Core v1.1 COMPLIANT (0 warning(s))` with exit code 0; if a future
validator version changes this banner, record the actual version/banner and
adjust the expectation deliberately.

## Keeping fixtures to investigate a failure

```bash
ALDC_E2E_KEEP=1 node tests/e2e/apm-consumer-install.mjs
```

The summary prints `Fixtures kept at: <path>`; each fixture is a complete
consumer project (deployed `.github/`, `.agents/`, `apm.lock.yaml`,
`apm_modules/`, scaffold output) that you can open and inspect. Remove the
directory manually when done.

## `#main` vs. a future tagged version

The default dependency is `javiarmesto/APM-ALDC#main` — a **moving ref**. Two
runs on different days can install different commits; the runner therefore
prints the exact resolved commit (e.g. `@11bff958`) in its summary so evidence
stays attributable.

Once a release tag exists (e.g. a future `v4.2.0`), test it with:

```bash
ALDC_APM_REF=v4.2.0 node tests/e2e/apm-consumer-install.mjs
```

A tag pins the install to one immutable commit, which is what the README's
consumer example will recommend. **This test kit never creates tags or
releases** — until the tag is published, `#main` is the reference to validate.

## The two entrypoint hashes (`3631…` vs `d863…`)

PR #10 review flagged that the EVO-000 evidence mentions hash
`3631b9c9…` while `aldc.yaml` pins `d86386d0…`. **Both are correct — they hash
different content representations of the same file**, the scaffold seed
`copilot-instructions.md`:

| Hash | Domain | Recorded as |
|------|--------|-------------|
| `3631b9c980d770292cabffb47b1c420b668cb6100eed4da07573b00f8ad0dc00` | **Raw file bytes** (including trailing newline) | `content_hash` in `apm.lock.yaml` for `.agents/skills/github-scaffold/scripts/seed/copilot-instructions.md` (APM's deployment ledger) |
| `d86386d0e84e07b54791bace6f659b99174baff0467bb453374700748877aa81` | **Trimmed UTF-8 text** (`content.trim()`) | `copilotEntrypointHash` in the seeded `aldc.yaml` and `copilotEntrypointSha256` in `scripts/build-apm.lock.json`; this is what `tools/aldc-validate` checks in `hash` mode |

The E2E `--force` scenario computes and prints both for the restored
entrypoint, and asserts the trimmed-text hash matches the `aldc.yaml` pin. Do
not "reconcile" the two values — they are different digests of the same
artifact by design.

## Known limitations

- The runner needs real network access; there is no offline/mocked mode by
  design (the point is a *real* install).
- APM configures the four MCP servers in the fixture's `.vscode/mcp.json`; the
  tests assert deployment shape, they do **not** exercise Copilot Chat / Copilot
  CLI runtime behavior with those servers.
- `#main` results are only attributable through the resolved commit the runner
  prints; use a tag for immutable evidence once one exists.
- The kit validates the **Copilot** target only (`target: [copilot]`). The
  Claude Code distribution is a separate package
  (`javiarmesto/APM-ALDC---Claude`) and is intentionally out of scope — as is
  any `.github/commands` layout, which belongs to Claude-style distributions
  and must never appear here.
- These are local validations; this repository has no GitHub Actions workflow
  running them yet (see EVO-110 in `HANDOFF-APM-ALDC-EVOLUTIVES.md`).
