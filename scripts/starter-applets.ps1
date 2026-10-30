function Read-StarterDefinition {
    $taskDefinition = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'starter-applets.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($taskDefinition.schemaVersion -ne 1 -or $taskDefinition.applets -isnot [array] -or $taskDefinition.applets.Count -eq 0) { throw 'Invalid or empty starter definition' }
    $taskRepositories = @{}
    $taskIds = @{}
    foreach ($taskItem in $taskDefinition.applets) {
        if ($taskItem.repository -isnot [string] -or $taskItem.repository -cnotmatch '^Applet\.[A-Za-z0-9][A-Za-z0-9._-]*$' -or $taskItem.repository.EndsWith('.')) { throw 'Invalid starter repository' }
        if ($taskItem.id -isnot [string] -or -not $taskItem.id -or $taskItem.id.Trim() -cne $taskItem.id) { throw 'Invalid starter Applet ID' }
        if ($taskRepositories.ContainsKey($taskItem.repository)) { throw 'Duplicate starter repository' }
        if ($taskIds.ContainsKey($taskItem.id)) { throw 'Duplicate Applet ID' }
        $taskRepositories[$taskItem.repository] = $true
        $taskIds[$taskItem.id] = $true
        $taskItem
    }
}
