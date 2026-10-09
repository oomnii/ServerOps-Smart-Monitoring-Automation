# Stop only the Django and Vite processes recorded by start-serverops.ps1.
# Does not stop other Python, Node.js, or Docker processes.
#
# From the project folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-serverops.ps1

$ErrorActionPreference = "Stop"

$RuntimeDir = Join-Path $PSScriptRoot ".runtime"
$StateFile = Join-Path $RuntimeDir "serverops-dev.json"

function Write-Status {
    param([string]$Message)
    Write-Host $Message
}

function Format-StartedAt {
    param($Date)
    if (-not $Date) {
        return ""
    }
    return ([DateTime]$Date).ToString("yyyy-MM-ddTHH:mm:ss")
}

function Get-ProcessInfo {
    param([int]$ProcessId)
    if ($ProcessId -le 0) {
        return $null
    }
    return Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Test-RecordMatches {
    param($Record, $Proc)
    if (-not $Record -or -not $Proc) {
        return $false
    }
    $started = Format-StartedAt $Proc.CreationDate
    return ([int]$Record.pid -eq [int]$Proc.ProcessId) -and ([string]$Record.startedAt -eq $started) -and ([string]$Record.commandLine -eq [string]$Proc.CommandLine)
}

if (-not (Test-Path -LiteralPath $StateFile)) {
    Write-Status "No ServerOps processes were recorded by start-serverops.ps1."
    Write-Status "If you started Django or Vite yourself, press Ctrl+C in those windows."
    Write-Status "This script does not stop other Python, Node.js, or Docker processes."
    exit 0
}

$state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
$failures = 0

foreach ($name in @("backend", "frontend")) {
    $record = $state.$name
    if (-not $record -or -not $record.pid) {
        Write-Status "$name was not started by the startup script."
        continue
    }

    $proc = Get-ProcessInfo -ProcessId ([int]$record.pid)
    if (-not $proc) {
        Write-Status "$name PID $($record.pid) is already gone."
        $state | Add-Member -NotePropertyName $name -NotePropertyValue $null -Force
        continue
    }

    if (-not (Test-RecordMatches -Record $record -Proc $proc)) {
        Write-Status "$name PID $($record.pid) now belongs to a different process. It was left running."
        $state | Add-Member -NotePropertyName $name -NotePropertyValue $null -Force
        continue
    }

    & taskkill.exe /PID ([int]$record.pid) /T /F | Out-Null
    $stopped = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $still = Get-ProcessInfo -ProcessId ([int]$record.pid)
        if (-not $still -or -not (Test-RecordMatches -Record $record -Proc $still)) {
            $stopped = $true
            break
        }
        Start-Sleep -Milliseconds 250
    }

    if ($stopped) {
        Write-Status "Stopped $name PID $($record.pid)."
        $state | Add-Member -NotePropertyName $name -NotePropertyValue $null -Force
    } else {
        Write-Status "Could not stop $name PID $($record.pid)."
        $failures += 1
    }
}

$remaining = @()
if ($state.backend -and $state.backend.pid) {
    $remaining += $state.backend
}
if ($state.frontend -and $state.frontend.pid) {
    $remaining += $state.frontend
}

if ($remaining.Count -eq 0) {
    Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
    $runtimeItems = @(Get-ChildItem -LiteralPath $RuntimeDir -Force -ErrorAction SilentlyContinue)
    if ($runtimeItems.Count -eq 0) {
        Remove-Item -LiteralPath $RuntimeDir -Force -ErrorAction SilentlyContinue
    }
} else {
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

if ($failures -gt 0) {
    exit 1
}

Write-Status "ServerOps development servers started by the script are stopped."
exit 0
