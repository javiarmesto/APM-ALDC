# Install-Scaffold.ps1 — Windows wrapper around the cross-platform Node installer.
# Seeds the ALDC project setup (.github/copilot-instructions.md, aldc.yaml,
# .github/plans/memory.md, tools/). The real logic lives in Install-Scaffold.mjs
# so Windows, macOS, Linux and Claude Code all share one implementation.
#
#   powershell -ExecutionPolicy Bypass -File <this> [-Force]

param([switch]$Force)

$ErrorActionPreference = "Stop"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js is required. Install Node, then run:" -ForegroundColor Red
  Write-Host "  node `"$PSScriptRoot\Install-Scaffold.mjs`"" -ForegroundColor Yellow
  exit 1
}

$nodeArgs = @("$PSScriptRoot\Install-Scaffold.mjs")
if ($Force) { $nodeArgs += "--force" }
& node @nodeArgs
exit $LASTEXITCODE
