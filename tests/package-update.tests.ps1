$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/update-packages.ps1')
$root = Split-Path $PSScriptRoot -Parent
$policy = Get-Content (Join-Path $root 'toolchain.json') -Raw | ConvertFrom-Json
$checks = 0
function Assert-Rejected {
    param([scriptblock]$Action, [string]$Message)
    try { & $Action | Out-Null } catch {
        if ($_.Exception.Message -notlike "*$Message*") { throw }
        $script:checks++
        return
    }
    throw "Expected rejection: $Message"
}
Assert-Rejected { Invoke-PackageUpdateCommand $env:ComSpec @('/d', '/c', 'exit 7') } 'Package update stopped'
$recent = [DateTimeOffset]::UtcNow.ToString('o')
$nodeReleases = @(
    [pscustomobject]@{ version = 'v26.1.0'; lts = $false; date = $recent },
    [pscustomobject]@{ version = 'v24.22.2'; lts = 'Krypton'; date = $recent },
    [pscustomobject]@{ version = 'v24.21.0'; lts = 'Krypton'; date = '2026-01-01' },
    [pscustomobject]@{ version = 'v25.0.0-rc.1'; lts = 'Invalid'; date = $recent }
)
$electronMetadata = @{
    'dist-tags' = @{ latest = '45.0.0'; beta = '46.0.0-beta.1' }
    versions = @{ '45.0.0' = @{ version = '45.0.0'; name = 'electron' } }
    time = @{ '45.0.0' = $recent }
}
function Invoke-RestMethod {
    param([string]$Uri, [int]$TimeoutSec)
    if ($script:failNetwork) { throw 'Network fixture unavailable' }
    if ($Uri -ceq 'https://nodejs.org/dist/index.json') { return $script:nodeReleases }
    if ($Uri -ceq 'https://registry.npmjs.org/electron') { return $script:electronMetadata }
    throw "Unexpected metadata URI: $Uri"
}
$latest = Get-LatestRuntimeVersions $policy
if ($latest.node -cne '24.22.2' -or $latest.electron -cne '45.0.0') { throw 'Latest stable / LTS selection failed.' }
$checks++
# Selection uses numeric versions rather than index order or lexical sorting.
$nodeReleases += [pscustomobject]@{ version = 'v24.100.0'; lts = 'Krypton'; date = $recent }
if ((Get-LatestRuntimeVersions $policy).node -cne '24.100.0') { throw 'Numeric version ordering failed.' }
$checks++
$nodeReleases = @($nodeReleases | Where-Object version -ne v24.100.0)
$electronMetadata.'dist-tags'.latest = '46.0.0-beta.1'
Assert-Rejected { Get-LatestRuntimeVersions $policy } 'must identify a stable'
$electronMetadata.'dist-tags'.latest = '45.0.0'
$electronMetadata.time.'45.0.0' = ''
Assert-Rejected { Get-LatestRuntimeVersions $policy } 'Missing publication'
$electronMetadata.time.'45.0.0' = $recent
$nodeReleases[1].date = ''
Assert-Rejected { Get-LatestRuntimeVersions $policy } 'Missing publication'
$nodeReleases[1].date = $recent
$savedNode = $nodeReleases
$nodeReleases = @([pscustomobject]@{ version = 'v26.1.0'; lts = $false; date = $recent })
Assert-Rejected { Get-LatestRuntimeVersions $policy } 'No official stable Node.js LTS'
$nodeReleases = $savedNode

$fixture = Join-Path $root ('.artifacts/package-update-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'toolchain.json') -Destination $fixture
Copy-Item -LiteralPath (Join-Path $root 'pnpm-workspace.yaml') -Destination $fixture
$policyPath = Join-Path $fixture 'toolchain.json'
$originalBytes = [Convert]::ToBase64String([IO.File]::ReadAllBytes($policyPath))
$packagePath = Join-Path $fixture 'package.json'
[IO.File]::WriteAllText($packagePath, '{"devDependencies":{"electron":"44.9.3"}}')
$calls = @()
$failCommand = ''
$wrongPin = $false
function Invoke-PackageUpdateCommand {
    param([string]$Command, [string[]]$Arguments)
    $script:calls += [pscustomobject]@{ command = [IO.Path]::GetFileName($Command); arguments = $Arguments }
    if ([IO.Path]::GetFileName($Command) -eq $script:failCommand) { throw 'Command fixture failed' }
    if ($Arguments.Count -gt 0 -and $Arguments[0] -ceq 'add') {
        if ($Arguments[-1] -cne 'electron@45.0.0' -or $Arguments -cnotcontains '--save-exact') { throw 'Electron is not exactly pinned.' }
        $version = if ($script:wrongPin) { '^45.0.0' } else { '45.0.0' }
        [IO.File]::WriteAllText($script:packagePath, ('{"devDependencies":{"electron":"' + $version + '"}}'))
    }
}
$null = Update-ProjectPackages $fixture -CheckOnly
if ($calls.Count -ne 0 -or [Convert]::ToBase64String([IO.File]::ReadAllBytes($policyPath)) -cne $originalBytes) { throw 'CheckOnly changed files or ran commands.' }
$checks++
$failNetwork = $true
Assert-Rejected { Update-ProjectPackages $fixture } 'Network fixture unavailable'
if ($calls.Count -ne 0 -or [Convert]::ToBase64String([IO.File]::ReadAllBytes($policyPath)) -cne $originalBytes) { throw 'Network failure changed files.' }
$checks++
$failNetwork = $false
$failCommand = 'setup-tools.bat'
Assert-Rejected { Update-ProjectPackages $fixture } 'Command fixture failed'
if ($calls.Count -ne 1 -or [Convert]::ToBase64String([IO.File]::ReadAllBytes($policyPath)) -cne $originalBytes) { throw 'Setup failure did not restore the original pin.' }
$checks++
$calls = @()
$failCommand = 'dev.bat'
Assert-Rejected { Update-ProjectPackages $fixture } 'Command fixture failed'
if ($calls.Count -ne 2) { throw 'Commands continued after Electron installation failed.' }
$checks++
$calls = @()
$failCommand = ''
$null = Update-ProjectPackages $fixture
if ($calls.Count -ne 3 -or $calls[0].command -cne 'setup-tools.bat' -or
    ($calls[2].arguments -join ' ') -cne 'update --latest' -or
    (Get-Content $policyPath -Raw | ConvertFrom-Json).node -cne '24.22.2') { throw 'Update workflow failed.' }
$checks++
$wrongPin = $true
Assert-Rejected { Update-ProjectPackages $fixture } 'Electron must stay exactly pinned'
[IO.File]::WriteAllText((Join-Path $fixture 'result.json'), ('{"passed":true,"checks":' + $checks + '}'))
Write-Output "Package update: $checks checks passed. Evidence: $fixture"
