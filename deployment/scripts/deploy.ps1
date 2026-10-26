param([string]$Destination)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
if (-not $Destination) {
    $configFile = Join-Path $projectDirectory 'deploy.local.txt'
    if (-not (Test-Path -LiteralPath $configFile -PathType Leaf)) { throw 'Pass a destination or create deploy.local.txt.' }
    $Destination = (Get-Content -LiteralPath $configFile -Encoding UTF8 -TotalCount 1).Trim()
}
if (-not [IO.Path]::IsPathFullyQualified($Destination)) { throw 'Destination must be an absolute path.' }
if (-not (Test-Path -LiteralPath $Destination -PathType Container)) { throw 'Destination folder must already exist.' }
$sourceDirectory = Join-Path $projectDirectory 'win-unpacked'
$helper = Join-Path $sourceDirectory 'resources\updater\AppDock.Updater.exe'
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) { throw 'Published host folder/updater is missing.' }
& $helper --deploy-host $sourceDirectory $Destination
if ($LASTEXITCODE -ne 0) { throw 'Host folder deployment failed. Close AppDock before deployment.' }
Write-Output "Deployed AppDock host folder to $Destination"
