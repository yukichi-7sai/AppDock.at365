param([string]$AppletRoot)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $AppletRoot) { $AppletRoot = Split-Path $taskRoot -Parent }
$AppletRoot = [IO.Path]::GetFullPath($AppletRoot)
. (Join-Path $PSScriptRoot 'publish-paths.ps1')
. (Join-Path $PSScriptRoot 'starter-applets.ps1')
$taskPublish = Get-PublishDirectory $taskRoot
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
$taskHelper = Join-Path $taskRoot '.artifacts\updater\AppDock.Updater.exe'

function Read-Json([string]$File) { Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json }
function File-Hash([string]$File) {
    $taskStream = [IO.File]::OpenRead($File)
    $taskHasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-', '').ToLowerInvariant() }
    finally { $taskHasher.Dispose(); $taskStream.Dispose() }
}
function Stable-Version([string]$Value) {
    if ($Value -notmatch '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(\+[0-9A-Za-z.-]+)?$') { throw "Invalid stable version: $Value" }
    return [version]((($Value -replace '^v', '') -split '\+')[0])
}
function Git-Value([string]$Repository, [string[]]$Arguments) {
    $taskValue = & git -c "safe.directory=$($Repository.Replace('\', '/'))" -C $Repository @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git failed: $Repository" }
    return $taskValue
}
function Assert-Payload($Feed, [string]$Directory, [string]$Kind, [string]$Id, [string]$Version) {
    $taskExpectedFile = 'update.zip'
    $taskExpectedFormat = 'zip'
    if ($Feed.schemaVersion -ne 1 -or $Feed.kind -ne $Kind -or $Feed.id -cne $Id -or $Feed.version -cne $Version -or
        $Feed.payload.file -cne $taskExpectedFile -or $Feed.payload.format -ne $taskExpectedFormat) { throw "Invalid update feed: $Directory" }
    $taskPayload = Join-Path $Directory $taskExpectedFile
    if ((Get-Item -LiteralPath $taskPayload).Length -ne $Feed.payload.size -or
        (File-Hash $taskPayload) -ne $Feed.payload.sha256) { throw "Payload hash/size mismatch: $taskPayload" }
    return $taskPayload
}

# Only the distribution roster selects repositories. Unlisted siblings are not read
# or published, and every listed repository must pass preflight before any build.
$taskDefinition = @(Read-StarterDefinition)
$taskHostVersion = Stable-Version $taskVersion
$taskHostFeed = Read-Json (Join-Path $taskPublish 'update.json')
$taskHostArchive = Assert-Payload $taskHostFeed $taskPublish 'host' 'host' $taskVersion
$taskIds = @{}
$taskApplets = @(foreach ($taskExpected in $taskDefinition) {
    $taskRepository = Join-Path $AppletRoot $taskExpected.repository
    if (-not (Test-Path -LiteralPath $taskRepository -PathType Container)) { throw "Missing starter repository: $($taskExpected.repository)" }
    $taskDirectory = Get-Item -LiteralPath $taskRepository
    $taskManifestPath = Join-Path $taskDirectory.FullName 'extension.json'
    if (-not (Test-Path -LiteralPath $taskManifestPath -PathType Leaf)) { throw "Missing extension.json: $taskDirectory" }
    if ($taskDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Applet repository cannot be a link: $taskDirectory" }
    if (-not (Test-Path -LiteralPath (Join-Path $taskDirectory.FullName '.git'))) { throw "Missing Applet Git repository: $taskDirectory" }
    $taskManifest = Read-Json $taskManifestPath
    if ($taskManifest.id -cne $taskExpected.id) { throw "Starter Applet ID mismatch: $taskDirectory" }
    if ($taskDirectory.Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or $taskManifest.apiVersion -ne 1 -or
        -not $taskManifest.id -or $taskManifest.runtime -notin @('node', 'dotnet', 'native')) { throw "Invalid Applet manifest: $taskManifestPath" }
    if ($taskIds.ContainsKey($taskManifest.id)) { throw "Duplicate Applet ID: $($taskManifest.id)" }
    $taskIds[$taskManifest.id] = $true
    $null = Stable-Version $taskManifest.version
    if ($taskManifest.minimumHostVersion -and (Stable-Version $taskManifest.minimumHostVersion) -gt $taskHostVersion) { throw "Applet requires a newer host: $($taskManifest.id)" }
    $taskPublisher = Join-Path $taskDirectory.FullName 'publish.bat'
    if (-not (Test-Path -LiteralPath $taskPublisher -PathType Leaf)) { throw "Missing publish.bat: $taskDirectory" }
    $taskGitRoot = Git-Value $taskDirectory.FullName @('rev-parse', '--show-toplevel')
    if ([IO.Path]::GetFullPath($taskGitRoot) -ne $taskDirectory.FullName) { throw "Not a repository root: $taskDirectory" }
    [pscustomobject]@{ directory = $taskDirectory; manifest = $taskManifest; publisher = $taskPublisher }
})
if ($taskApplets.Count -eq 0) { throw "No Applet repositories found in $AppletRoot" }

$taskStage = Join-Path $taskRoot ('.artifacts\starter-' + [guid]::NewGuid().ToString('N'))
$taskPackage = Join-Path $taskStage 'package'
& $taskHelper --extract-host $taskHostArchive $taskPackage
if ($LASTEXITCODE -ne 0) { throw 'Host folder extraction failed.' }
New-Item -ItemType Directory -Path (Join-Path $taskPackage 'extensions') -Force | Out-Null
$taskInventory = @()
foreach ($taskApplet in $taskApplets) {
    $taskRepository = $taskApplet.directory.FullName
    Write-Output "Publishing bundled Applet: $($taskApplet.directory.Name)"
    & $taskApplet.publisher
    if ($LASTEXITCODE -ne 0) { throw "Applet publish failed ($LASTEXITCODE): $taskRepository" }
    $taskOutput = Get-PublishDirectory $taskRepository
    $taskFeed = Read-Json (Join-Path $taskOutput 'update.json')
    $taskArchive = Assert-Payload $taskFeed $taskOutput 'applet' $taskApplet.manifest.id $taskApplet.manifest.version
    $taskInstalled = Join-Path (Join-Path $taskPackage 'extensions') $taskApplet.directory.Name
    & $taskHelper --extract $taskArchive $taskInstalled
    if ($LASTEXITCODE -ne 0) { throw "Applet extraction failed: $taskRepository" }
    $taskInstalledManifest = Read-Json (Join-Path $taskInstalled 'extension.json')
    if ($taskInstalledManifest.id -cne $taskApplet.manifest.id -or $taskInstalledManifest.version -cne $taskApplet.manifest.version -or
        $taskInstalledManifest.apiVersion -ne 1 -or $taskInstalledManifest.runtime -ne $taskApplet.manifest.runtime -or
        $taskInstalledManifest.minimumHostVersion -ne $taskApplet.manifest.minimumHostVersion) { throw "Published manifest differs from source: $taskRepository" }
    $taskEntry = [IO.Path]::GetFullPath((Join-Path $taskInstalled $taskInstalledManifest.entry))
    if (-not $taskEntry.StartsWith($taskInstalled + '\', [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $taskEntry -PathType Leaf)) { throw "Invalid Applet entry: $taskRepository" }
    $taskInventory += [ordered]@{
        repository = $taskApplet.directory.Name
        id = $taskInstalledManifest.id
        version = $taskInstalledManifest.version
        minimumHostVersion = $taskInstalledManifest.minimumHostVersion
        commit = (Git-Value $taskRepository @('rev-parse', 'HEAD'))
        dirty = [bool](Git-Value $taskRepository @('status', '--porcelain', '--untracked-files=normal'))
        updateZipSha256 = $taskFeed.payload.sha256
    }
}
$taskFiles = @(Get-ChildItem -LiteralPath $taskPackage -Recurse -File | Sort-Object FullName | ForEach-Object {
    [ordered]@{ path = $_.FullName.Substring($taskPackage.Length + 1).Replace('\', '/'); size = $_.Length; sha256 = (File-Hash $_.FullName) }
})
$taskBundle = [ordered]@{
    schemaVersion = 1
    hostVersion = $taskVersion
    hostPayloadSha256 = File-Hash $taskHostArchive
    hostCommit = (Git-Value $taskRoot @('rev-parse', 'HEAD'))
    hostDirty = [bool](Git-Value $taskRoot @('status', '--porcelain', '--untracked-files=normal'))
    createdAt = [DateTimeOffset]::UtcNow.ToString('o')
    applets = $taskInventory
    files = $taskFiles
}
[IO.File]::WriteAllText((Join-Path $taskPackage 'bundle.json'), ($taskBundle | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
# Only the fresh package directory is archived. No settings, browser profiles, logs,
# repository sources, or update ZIPs are copied from the host's publish directory.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskTemporaryZip = Join-Path $taskStage 'starter.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($taskPackage, $taskTemporaryZip, [IO.Compression.CompressionLevel]::Optimal, $false)
$taskZip = Join-Path $taskPublish "AppDock.at365-starter-$taskVersion.zip"
# Keep the last complete archive if any build/validation fails before this point.
# Retain the previous ZIP in the stage; a null backup can fail on existing files.
if (Test-Path -LiteralPath $taskZip) { [IO.File]::Replace($taskTemporaryZip, $taskZip, (Join-Path $taskStage 'previous-starter.zip')) }
else { [IO.File]::Move($taskTemporaryZip, $taskZip) }
Write-Output "Starter package: $taskZip"
Write-Output "Bundled Applets: $($taskApplets.Count)"
Write-Output "Package manifest: $(Join-Path $taskPackage 'bundle.json')"
