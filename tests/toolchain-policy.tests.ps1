$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/toolchain-policy.ps1')
$policy = Get-Content (Join-Path $PSScriptRoot '../toolchain.json') -Raw | ConvertFrom-Json
$workspace = Get-Content (Join-Path $PSScriptRoot '../pnpm-workspace.yaml') -Raw
$now = [DateTimeOffset]'2026-10-11T12:00:00Z'
$checks = 0
function Assert-Rejected {
    param([scriptblock]$Action, [string]$Message)
    $rejected = $false
    try { & $Action | Out-Null } catch {
        if ($_.Exception.Message -notlike "*$Message*") { throw }
        $rejected = $true
    }
    if (-not $rejected) { throw "Expected rejection: $Message" }
    $script:checks++
}
Assert-ToolchainPolicy $policy $workspace
$checks++
Assert-Rejected { Assert-ToolchainPolicy $policy ($workspace -replace '10080', '1440') } 'must match'
Assert-Rejected { Assert-ToolchainPolicy $policy ($workspace -replace 'minimumReleaseAgeStrict: true', 'minimumReleaseAgeStrict: false') } 'must match'
if (Assert-ToolRelease $policy pnpm 12.10.1 '2026-10-04T12:00:00Z' $now) { throw 'Boundary release used an exception.' }
$checks++
Assert-Rejected { Assert-ToolRelease $policy pnpm 12.10.1 '2026-10-04T12:00:01Z' $now } 'too recent'
if (-not (Assert-ToolRelease $policy node 24.21.0 '2026-10-11' $now)) { throw 'Node exemption was not applied.' }
$checks++
Assert-Rejected { Assert-ToolRelease $policy pnpm 12.10.1 '' $now } 'Missing publication'
Assert-Rejected { Assert-ToolRelease $policy pnpm 12.10.1 'invalid' $now } 'Invalid publication'
$policy.releaseAgeExceptions = @([pscustomobject]@{ package = 'pnpm'; version = '12.10.1'; reason = 'Security fix fixture' })
if (-not (Assert-ToolRelease $policy pnpm 12.10.1 '2026-10-11T10:00:00Z' $now)) { throw 'Exact exception was not applied.' }
$checks++
Assert-Rejected { Assert-ToolRelease $policy pnpm 12.10.2 '2026-10-11T10:00:00Z' $now } 'too recent'
if (-not (Assert-ToolRelease $policy node 24.22.1 '2026-10-11T10:00:00Z' $now)) { throw 'Node exemption must cover new versions.' }
$checks++
Assert-Rejected { Assert-ToolRelease $policy pnpm 12.10.1 '' $now } 'Missing publication'
$policy.releaseAgeExceptions[0].reason = ''
Assert-Rejected { Assert-ToolchainPolicy $policy $workspace } 'reason'
$policy.releaseAgeExceptions = @()
function Invoke-RestMethod {
    param([string]$Uri, [int]$TimeoutSec)
    if ($Uri -eq 'https://nodejs.org/dist/index.json') {
        return @([pscustomobject]@{ version = 'v24.21.0'; date = '2026-09-08'; lts = $script:fixtureLts })
    }
    if ($Uri -eq 'https://registry.npmjs.org/pnpm') {
        return [pscustomobject]@{
            versions = @{ '12.10.1' = @{ optionalDependencies = @{ '@pnpm/exe.win32-x64' = '12.10.1' } } }
            time = @{ '12.10.1' = '2020-01-01T00:00:00Z' }
        }
    }
    if ($Uri -eq 'https://registry.npmjs.org/@pnpm%2fexe.win32-x64') {
        return [pscustomobject]@{ time = @{ '12.10.1' = $script:nativeDate } }
    }
    throw "Unexpected URI: $Uri"
}
$fixtureLts = $false
Assert-Rejected { Get-ApprovedNodeRelease $policy 24.21.0 } 'not an official LTS'
$fixtureLts = 'Krypton'
$null = Get-ApprovedNodeRelease $policy 24.21.0
$checks++
$nativeDate = [DateTimeOffset]::UtcNow.ToString('o')
Assert-Rejected { Get-ApprovedPnpmInstallArguments $policy 12.10.1 } 'too recent'
$nativeDate = ''
Assert-Rejected { Get-ApprovedPnpmInstallArguments $policy 12.10.1 } 'Missing publication'
$nativeDate = '2020-01-01T00:00:00Z'
$arguments = @(Get-ApprovedPnpmInstallArguments $policy 12.10.1)
if ($arguments.Count -ne 1 -or $arguments[0] -ne '--min-release-age=7') { throw 'Unexpected bootstrap arguments.' }
$checks++
Assert-Rejected { Assert-ToolRelease $policy node 24.22.1 '' $now } 'Missing publication'
Assert-Rejected { Assert-ToolRelease $policy electron 45.0.0 'invalid' $now } 'Invalid publication'
if (-not (Assert-ToolRelease $policy electron 45.0.0 '2026-10-11T10:00:00Z' $now)) { throw 'Electron exemption was not applied.' }
$checks++
$policy.releaseAgeExemptPackages = @('node', 'pnpm')
Assert-Rejected { Assert-ToolchainPolicy $policy $workspace } 'Permanent release-age exemptions'
$policy.releaseAgeExemptPackages = @('node', 'node')
Assert-Rejected { Assert-ToolchainPolicy $policy $workspace } 'Permanent release-age exemptions'
$policy.releaseAgeExemptPackages = @('node', 'electron')
Assert-Rejected { Assert-ToolchainPolicy $policy ($workspace -replace "'electron'", "'electron@44.9.3'") } 'Permanent release-age exemptions'
Write-Output "Toolchain policy: $checks checks passed."
