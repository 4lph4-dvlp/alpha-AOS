[CmdletBinding()]
param(
    [switch]$SkipLink,
    [switch]$Apply,
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 24 or newer is required.'
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
    throw "Node.js 24 or newer is required; found $(node --version)."
}

Push-Location $repoRoot
try {
    npm ci
    npm run build
    if (-not $SkipLink) {
        npm link
        Write-Host 'Installed alpha-aos as a user-wide npm command.'
    }
    node dist/src/cli.js doctor
    if ($LASTEXITCODE -ne 0) { throw "alpha-AOS doctor failed with exit code $LASTEXITCODE." }

    $arguments = @('dist/src/cli.js', 'install')
    if ($Target) { $arguments += @('--target', $Target) }
    if ($Apply) {
        $arguments += '--apply'
    }
    else {
        Write-Host 'Showing the detected-harness install plan only.'
        Write-Host 'Re-run with -Apply to mutate user-wide harness configuration.'
    }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw "alpha-AOS install failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}
