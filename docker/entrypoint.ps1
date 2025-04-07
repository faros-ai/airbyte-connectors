# Powershell script to assign 75% of memory to Node.js heap
# Run with: powershell -File entrypoint.ps1

function Get-MemoryLimitFromFile {
    param([string]$Path)
    if (Test-Path $Path) {
        return Get-Content $Path -Raw
    }
    return ""
}

function Get-ContainerMemoryLimit {
    $files = @(
        "/sys/fs/cgroup/memory/memory.limit_in_bytes",
        "/sys/fs/cgroup/memory.max",
        "/sys/fs/cgroup/memory/memory.max_usage_in_bytes"
    )

    foreach ($file in $files) {
        if (Test-Path $file) {
            $limit = Get-MemoryLimitFromFile $file
            if ($limit -match '^\d+$') {
                return [double]$limit
            }
        }
    }
    return $null
}

$memoryLimit = Get-ContainerMemoryLimit

if ($memoryLimit) {
    $memoryLimitMB = [math]::Floor($memoryLimit / 1024 / 1024)
    $maxOldSpaceSize = [math]::Floor($memoryLimitMB * 0.75)
    $env:NODE_OPTIONS = "--max-old-space-size=$maxOldSpaceSize"
}

# Run the Node.js main script
& "C:\airbyte\main" $args
