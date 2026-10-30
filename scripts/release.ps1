param(
    [Parameter(Mandatory = $true)][ValidateSet('SetVersion', 'Prepare', 'Draft', 'Publish', 'Verify')][string]$Mode,
    [string]$Version,
    [string]$NotesFile,
    [string]$PlanPath,
    [string]$GhPath
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskToolchain = Get-Content -LiteralPath (Join-Path $taskRoot 'toolchain.json') -Raw | ConvertFrom-Json
$taskNode = Join-Path $taskRoot ".tools\node\$($taskToolchain.node)\node.exe"
$taskCore = Join-Path $PSScriptRoot 'release.cjs'
if (-not (Test-Path -LiteralPath $taskNode -PathType Leaf)) { throw 'Run setup-tools.bat first.' }
function Invoke-Node([string[]]$Arguments) {
    & $taskNode @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Release step failed ($LASTEXITCODE). See the output above." }
}
if ($Mode -eq 'SetVersion') {
    if (-not $Version) { throw 'SetVersion requires -Version.' }
    Invoke-Node @($taskCore, 'version', $Version)
    return
}
if ($Mode -eq 'Prepare') {
    if (-not $NotesFile) { throw 'Prepare requires -NotesFile (reviewed release notes).' }
    if (-not $PlanPath) { $PlanPath = Join-Path $taskRoot ('.artifacts\release-' + [guid]::NewGuid().ToString('N') + '\plan.json') }
    $PlanPath = [IO.Path]::GetFullPath($PlanPath)
    Invoke-Node @($taskCore, 'preflight', $PlanPath, [IO.Path]::GetFullPath($NotesFile))
    $taskLogRoot = Split-Path $PlanPath -Parent
    $taskSteps = @(
        @{ name = 'typecheck'; file = (Join-Path $taskRoot 'dev.bat'); arguments = @('run', 'typecheck') },
        @{ name = 'regression'; file = (Join-Path $taskRoot 'dev.bat'); arguments = @('test') },
        @{ name = 'publish'; file = (Join-Path $taskRoot 'publish.bat'); arguments = @() },
        @{ name = 'pack-starter'; file = (Join-Path $taskRoot 'dev.bat'); arguments = @('run', 'pack:starter') },
        @{ name = 'portable-updates'; file = $taskNode; arguments = @('scripts/portable-updates-ui-test.cjs') },
        @{ name = 'update-progress'; file = $taskNode; arguments = @('scripts/update-progress-ui-test.cjs') },
        @{ name = 'update-recovery'; file = $taskNode; arguments = @('scripts/update-recovery-test.cjs') },
        @{ name = 'starter'; file = $taskNode; arguments = @('scripts/starter-ui-test.cjs', (Join-Path $taskLogRoot 'bundle-ui.json')) }
    )
    $taskPassed = @()
    Push-Location $taskRoot
    try {
        foreach ($taskStep in $taskSteps) {
            $taskLog = Join-Path $taskLogRoot ($taskStep.name + '.log')
            Write-Output "Running $($taskStep.name): $taskLog"
            $taskArguments = $taskStep.arguments
            if (-not (Test-Path -LiteralPath $taskStep.file -PathType Leaf)) { throw "Missing command: $($taskStep.file)" }
            # Windows PowerShell 5.1 can turn successful native stderr into an
            # ErrorRecord. Keep that output in the log and judge the exit code.
            $taskPreviousPreference = $ErrorActionPreference
            $taskExit = 1
            try {
                $ErrorActionPreference = 'Continue'
                $LASTEXITCODE = 1
                & $taskStep.file @taskArguments *> $taskLog
                $taskExit = $LASTEXITCODE
            } finally { $ErrorActionPreference = $taskPreviousPreference }
            if ($taskExit -ne 0) {
                Get-Content -LiteralPath $taskLog -Tail 35
                throw "Release preparation stopped at $($taskStep.name). No Release was created."
            }
            $taskPassed += $taskStep.name
        }
        [IO.File]::WriteAllText((Join-Path $taskLogRoot 'checks.json'), ($taskPassed | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        Invoke-Node @($taskCore, 'seal', $PlanPath)
    } finally { Pop-Location }
    Write-Output "Prepared release plan: $PlanPath"
    return
}
if (-not $PlanPath) { throw "$Mode requires -PlanPath from a successful Prepare." }
if (-not $GhPath) {
    $taskCommand = Get-Command gh -ErrorAction SilentlyContinue
    if ($taskCommand) { $GhPath = $taskCommand.Source }
    elseif (Test-Path -LiteralPath 'C:\Program Files\GitHub CLI\gh.exe') { $GhPath = 'C:\Program Files\GitHub CLI\gh.exe' }
    else { throw 'GitHub CLI was not found. Specify -GhPath.' }
}
Invoke-Node @($taskCore, $Mode.ToLowerInvariant(), [IO.Path]::GetFullPath($PlanPath), $GhPath)
