function Assert-ToolchainPolicy {
    param($Policy, [string]$WorkspaceText)
    if ($Policy.nodeChannel -ne 'lts') { throw 'toolchain.json nodeChannel must be lts.' }
    if ($Policy.minimumReleaseAgeDays -isnot [int] -or $Policy.minimumReleaseAgeDays -lt 1) {
        throw 'minimumReleaseAgeDays must be a positive integer.'
    }
    $exempt = @($Policy.releaseAgeExemptPackages)
    if ($exempt.Count -ne 2 -or @($exempt | Where-Object { $_ -cnotin @('node', 'electron') }).Count -ne 0 -or
        @($exempt | Select-Object -Unique).Count -ne 2 -or
        $WorkspaceText -notmatch '(?m)^\s+- [''"]?electron[''"]?\s*$') {
        throw 'Permanent release-age exemptions must be node and electron, with electron in pnpm-workspace.yaml.'
    }
    $minutes = $Policy.minimumReleaseAgeDays * 1440
    if ($WorkspaceText -notmatch "(?m)^minimumReleaseAge: $minutes\s*$" -or
        $WorkspaceText -notmatch '(?m)^minimumReleaseAgeStrict: true\s*$' -or
        $WorkspaceText -notmatch '(?m)^minimumReleaseAgeIgnoreMissingTime: false\s*$') {
        throw 'pnpm-workspace.yaml must match the strict toolchain release-age policy.'
    }
    foreach ($exception in $Policy.releaseAgeExceptions) {
        if ($exception.package -notin @('node', 'pnpm', '@pnpm/exe.win32-x64') -or
            $exception.version -notmatch '^\d+\.\d+\.\d+$' -or
            [string]::IsNullOrWhiteSpace($exception.reason)) {
            throw 'Tool exceptions require an allowed package, an exact version and a reason.'
        }
    }
}

function Assert-ToolRelease {
    param($Policy, [string]$Package, [string]$Version, [string]$Published,
        [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow)
    if ([string]::IsNullOrWhiteSpace($Published)) { throw "Missing publication date: $Package@$Version" }
    try {
        $publishedAt = [DateTimeOffset]::Parse($Published, [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::AssumeUniversal)
        # Node's index has a date, not a timestamp. Wait through that entire UTC day.
        if ($Published -match '^\d{4}-\d{2}-\d{2}$') { $publishedAt = $publishedAt.AddDays(1) }
    } catch { throw "Invalid publication date: $Package@$Version" }
    if ($Package -cin $Policy.releaseAgeExemptPackages) {
        return $true
    }
    if ($publishedAt -gt $Now.AddDays(-$Policy.minimumReleaseAgeDays)) {
        $exception = @($Policy.releaseAgeExceptions | Where-Object {
            $_.package -ceq $Package -and $_.version -ceq $Version
        })
        if ($exception.Count -eq 0) {
            throw "Release is too recent: $Package@$Version. Eligible after $($publishedAt.AddDays($Policy.minimumReleaseAgeDays).ToString('u'))."
        }
        Write-Warning "Release-age exception: $Package@$Version ($($exception[0].reason))"
        return $true
    }
    return $false
}

function Get-LatestRuntimeVersions {
    param($Policy)
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
    $lts = @($releases | Where-Object {
        $_.version -cmatch '^v\d+\.\d+\.\d+$' -and $_.lts -is [string] -and
        -not [string]::IsNullOrWhiteSpace($_.lts)
    } | Sort-Object { [version]$_.version.Substring(1) } -Descending)
    if ($lts.Count -eq 0) { throw 'No official stable Node.js LTS release was found.' }
    $node = $lts[0]
    $nodeVersion = $node.version.Substring(1)
    $null = Assert-ToolRelease $Policy 'node' $nodeVersion $node.date
    $metadata = Invoke-RestMethod -Uri 'https://registry.npmjs.org/electron' -TimeoutSec 30
    $electron = $metadata.'dist-tags'.latest
    if ($electron -isnot [string] -or $electron -cnotmatch '^\d+\.\d+\.\d+$' -or
        $metadata.versions.$electron.version -cne $electron -or
        $metadata.versions.$electron.name -cne 'electron') {
        throw 'The official Electron latest tag must identify a stable electron release.'
    }
    $null = Assert-ToolRelease $Policy 'electron' $electron $metadata.time.$electron
    return [pscustomobject]@{
        node = $nodeVersion; nodeLts = $node.lts; nodePublished = $node.date
        electron = $electron; electronPublished = $metadata.time.$electron
    }
}

function Get-ApprovedNodeRelease {
    param($Policy, [string]$Version)
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
    $release = @($releases | Where-Object { $_.version -ceq "v$Version" })
    if ($release.Count -ne 1 -or $release[0].lts -isnot [string] -or
        [string]::IsNullOrWhiteSpace($release[0].lts)) {
        throw "Node.js $Version is not an official LTS release."
    }
    $null = Assert-ToolRelease $Policy 'node' $Version $release[0].date
    return $release[0]
}

function Get-ApprovedPnpmInstallArguments {
    param($Policy, [string]$Version)
    # npm bootstraps pnpm; the workspace's pnpm settings cannot govern this install.
    $metadata = Invoke-RestMethod -Uri 'https://registry.npmjs.org/pnpm' -TimeoutSec 30
    $arguments = @("--min-release-age=$($Policy.minimumReleaseAgeDays)")
    if (Assert-ToolRelease $Policy 'pnpm' $Version $metadata.time.$Version) {
        $arguments += '--min-release-age-exclude=pnpm'
    }
    if ([int]($Version.Split('.')[0]) -lt 12) { return $arguments }
    $nativeName = '@pnpm/exe.win32-x64'
    if ($metadata.versions.$Version.optionalDependencies.$nativeName -cne $Version) {
        throw 'Expected an exactly pinned Windows x64 pnpm binary dependency.'
    }
    $nativeMetadata = Invoke-RestMethod -Uri 'https://registry.npmjs.org/@pnpm%2fexe.win32-x64' -TimeoutSec 30
    if (Assert-ToolRelease $Policy $nativeName $Version $nativeMetadata.time.$Version) {
        $arguments += "--min-release-age-exclude=$nativeName"
    }
    return $arguments
}
