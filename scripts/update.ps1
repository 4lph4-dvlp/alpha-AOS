# A launcher, not an updater.
#
# The dirty-checkout check, the remote resolution, the fast-forward, the
# package install, the build, the link and the managed reconcile all belong to
# the core service, which performs them under one reviewed plan and one writer
# session. This script verifies the artifact and delegates.
[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js 24 or newer is required.' -ErrorAction Continue
    exit 3
}

Push-Location $repoRoot
try {
    node scripts/build-artifact.mjs check
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'alpha-aos: refusing to run without a verified build artifact.' -ErrorAction Continue
        exit 3
    }

    $arguments = @('dist/src/cli.js', 'bootstrap', 'update')
    if ($Target) { $arguments += @('--target', $Target) }
    if ($Apply) {
        $arguments += '--apply'
    }
    else {
        Write-Host 'Showing the update plan only.'
        Write-Host 'Re-run with -Apply to run it under one reviewed operation session.'
    }

    & node @arguments
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
