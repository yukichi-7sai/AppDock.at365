function Get-PublishDirectory([string]$Repository) {
    $taskRepository = [IO.Path]::GetFullPath($Repository)
    return [IO.Path]::GetFullPath((Join-Path $taskRepository ('..\..\40.ARTIFACT\' + (Split-Path $taskRepository -Leaf))))
}
