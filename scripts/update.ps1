[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git is required to update a source checkout.'
    }
    $dirty = git status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the Git working tree.' }
    if ($dirty) {
        throw 'Refusing to update a dirty checkout. Commit or stash local changes first.'
    }

    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only failed.' }
    npm ci
    npm run build
    npm link

    if ($Apply) {
        $arguments = @('dist/src/cli.js', 'update', '--apply')
    }
    else {
        $arguments = @('dist/src/cli.js', 'install')
        if ($Target) { $arguments += @('--target', $Target) }
        Write-Host 'Update downloaded and built. Showing the stable reconcile plan only.'
        Write-Host 'Re-run with -Apply to mutate harness configuration.'
    }
    if ($Apply -and $Target) { $arguments += @('--target', $Target) }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw "alpha-AOS reconcile failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}
