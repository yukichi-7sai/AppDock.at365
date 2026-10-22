[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'toolchain-policy.ps1')

function Invoke-PackageUpdateCommand {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Package update stopped: $Command ($LASTEXITCODE). Review local changes before retrying." }
}

function Update-ProjectPackages {
    param([string]$ProjectDirectory, [switch]$CheckOnly)
    $policyPath = Join-Path $ProjectDirectory 'toolchain.json'
    $originalPolicy = [IO.File]::ReadAllBytes($policyPath)
    $policy = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
    Assert-ToolchainPolicy $policy (Get-Content -LiteralPath (Join-Path $ProjectDirectory 'pnpm-workspace.yaml') -Raw)
    $modules = Join-Path $ProjectDirectory 'node_modules'
    if ((Test-Path -LiteralPath $modules) -and
        ((Get-Item -LiteralPath $modules -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Package updates require an independent node_modules directory, not a junction or symbolic link.'
    }
    # Resolve both official sources before changing any pins. No cached fallback.
    $latest = Get-LatestRuntimeVersions $policy
    if ($CheckOnly) { return $latest }
    Write-Host "Updating to Node.js $($latest.node) LTS ($($latest.nodeLts)) and Electron $($latest.electron)."
    if ($policy.node -cne $latest.node) {
        $policy.node = $latest.node
        $text = $policy | ConvertTo-Json -Depth 10
        [IO.File]::WriteAllText($policyPath, $text + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    }
    try {
        Invoke-PackageUpdateCommand (Join-Path $ProjectDirectory 'setup-tools.bat') @()
    } catch {
        # Setup switches environment.bat only on success; retain the old pin on failure.
        [IO.File]::WriteAllBytes($policyPath, $originalPolicy)
        throw
    }
    $dev = Join-Path $ProjectDirectory 'dev.bat'
    Invoke-PackageUpdateCommand $dev @('add', '--save-dev', '--save-exact', "electron@$($latest.electron)")
    Invoke-PackageUpdateCommand $dev @('update', '--latest')
    # pnpm updates must retain the exact runtime selected above.
    $package = Get-Content -LiteralPath (Join-Path $ProjectDirectory 'package.json') -Raw | ConvertFrom-Json
    if ($package.devDependencies.electron -cne $latest.electron) {
        throw 'Electron must stay exactly pinned to the selected latest stable version. Review package.json and pnpm-lock.yaml.'
    }
    Write-Host 'Package update complete. Review changes, run affected tests and publish before releasing.'
    return $latest
}

if ($MyInvocation.InvocationName -ne '.') {
    Update-ProjectPackages (Split-Path $PSScriptRoot -Parent) -CheckOnly:$CheckOnly
}
