# A launcher, not an installer.
#
# This script verifies that a build artifact with proven provenance exists and
# then hands the whole operation to the core service, which owns the reviewed
# plan and the single writer session. It runs no git, npm, build or link step
# of its own, and it has no fallback path that would.
[CmdletBinding()]
param(
    [switch]$SkipLink,
    [switch]$Apply,
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js 24 or newer is required.' -ErrorAction Continue
    exit 3
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
    Write-Error "Node.js 24 or newer is required; found $(node --version)." -ErrorAction Continue
    exit 3
}

Push-Location $repoRoot
try {
    # The only prerequisite. A missing or stale artifact refuses here; this
    # script never rebuilds one, because building is a mutation and mutations
    # belong to the reviewed operation.
    node scripts/build-artifact.mjs check
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'alpha-aos: refusing to run without a verified build artifact.' -ErrorAction Continue
        exit 3
    }

    $arguments = @('dist/src/cli.js', 'bootstrap', 'install')
    if ($SkipLink) { $arguments += '--skip-link' }
    if ($Target) { $arguments += @('--target', $Target) }
    if ($Apply) {
        $arguments += '--apply'
    }
    else {
        Write-Host 'Showing the install plan only.'
        Write-Host 'Re-run with -Apply to run it under one reviewed operation session.'
    }

    & node @arguments
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
