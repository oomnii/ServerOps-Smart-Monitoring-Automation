# Start the ServerOps Django API and React dashboard on this PC.
# Does not change the system execution policy and does not need administrator rights.
#
# From the project folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-serverops.ps1

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
$Vite = Join-Path $FrontendDir "node_modules\vite\bin\vite.js"
$EnvFile = Join-Path $BackendDir ".env"
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

function Quote-Literal {
    param([string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Get-ProcessInfo {
    param([int]$ProcessId)
    if ($ProcessId -le 0) {
        return $null
    }
    return Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Get-ListeningPids {
    param([int]$Port)
    $found = New-Object System.Collections.Generic.List[int]
    foreach ($row in (netstat -ano -p tcp)) {
        if ($row -notmatch "LISTENING") {
            continue
        }
        $parts = @($row -split "\s+" | Where-Object { $_ -ne "" })
        if ($parts.Count -lt 5) {
            continue
        }
        if ($parts[1] -match ":$Port$") {
            $found.Add([int]$parts[-1])
        }
    }
    return @($found | Select-Object -Unique)
}

function Read-State {
    if (-not (Test-Path -LiteralPath $StateFile)) {
        return $null
    }
    return Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
}

function Write-State {
    param($State)
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Test-SamePath {
    param([string]$Left, [string]$Right)
    if (-not $Left -or -not $Right) {
        return $false
    }
    if (-not (Test-Path -LiteralPath $Left) -or -not (Test-Path -LiteralPath $Right)) {
        return $false
    }
    $leftPath = (Resolve-Path -LiteralPath $Left).Path
    $rightPath = (Resolve-Path -LiteralPath $Right).Path
    return $leftPath -eq $rightPath
}

function Test-BackendProcess {
    param($Proc)
    if (-not $Proc) {
        return $false
    }
    $command = [string]$Proc.CommandLine
    $matchesExe = Test-SamePath -Left ([string]$Proc.ExecutablePath) -Right $Python
    return $matchesExe -and ($command -match "manage\.py") -and ($command -match "runserver") -and ($command -match "127\.0\.0\.1:8000")
}

function Test-FrontendProcess {
    param($Proc)
    if (-not $Proc) {
        return $false
    }
    return ([string]$Proc.CommandLine) -like "*$Vite*"
}

function Test-ProcessFamily {
    param($Proc, [scriptblock]$Matcher)
    $current = $Proc
    for ($depth = 0; $depth -lt 10 -and $current; $depth++) {
        if (& $Matcher $current) {
            return $true
        }
        $current = Get-ProcessInfo -ProcessId ([int]$current.ParentProcessId)
    }
    return $false
}

function Test-RecordMatches {
    param($Record, $Proc)
    if (-not $Record -or -not $Proc) {
        return $false
    }
    $started = Format-StartedAt $Proc.CreationDate
    return ([int]$Record.pid -eq [int]$Proc.ProcessId) -and ([string]$Record.startedAt -eq $started) -and ([string]$Record.commandLine -eq [string]$Proc.CommandLine)
}

function Test-OwnedListener {
    param($Record, $Listener)
    if (-not $Record -or -not $Listener) {
        return $false
    }
    $owner = Get-ProcessInfo -ProcessId ([int]$Record.pid)
    if (-not (Test-RecordMatches -Record $Record -Proc $owner)) {
        return $false
    }
    $current = $Listener
    for ($depth = 0; $depth -lt 10 -and $current; $depth++) {
        if ([int]$current.ProcessId -eq [int]$owner.ProcessId) {
            return $true
        }
        $current = Get-ProcessInfo -ProcessId ([int]$current.ParentProcessId)
    }
    return $false
}

function New-Record {
    param($Proc)
    return [ordered]@{
        pid = [int]$Proc.ProcessId
        startedAt = Format-StartedAt $Proc.CreationDate
        commandLine = [string]$Proc.CommandLine
    }
}

function Wait-ForUrl {
    param([string]$Url)
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            $request = [System.Net.HttpWebRequest]::Create($Url)
            $request.Proxy = $null
            $request.Timeout = 2000
            $request.Method = "GET"
            $response = $request.GetResponse()
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            $content = $reader.ReadToEnd()
            $reader.Close()
            $code = [int]$response.StatusCode
            $response.Close()
            if ($code -eq 200) {
                return [pscustomobject]@{ StatusCode = $code; Content = $content }
            }
        } catch {
            Start-Sleep -Milliseconds 500
            continue
        }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Start-ProjectWindow {
    param([string]$Command)
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($Command))
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $info.Arguments = "-NoExit -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
    $info.UseShellExecute = $true
    return [System.Diagnostics.Process]::Start($info)
}

function Stop-OwnedProcess {
    param($Record)
    $proc = Get-ProcessInfo -ProcessId ([int]$Record.pid)
    if (-not (Test-RecordMatches -Record $Record -Proc $proc)) {
        return
    }
    & taskkill.exe /PID ([int]$Record.pid) /T /F | Out-Null
}

Write-Status "ServerOps project: $Root"

if (-not (Test-Path -LiteralPath $Python)) {
    Write-Status "The Python 3.11 virtual environment is missing: backend\.venv"
    Write-Status "Create it with the First-Time Setup steps in README.md, then run this script again."
    exit 1
}

$pythonVersion = & $Python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($LASTEXITCODE -ne 0 -or $pythonVersion.Trim() -ne "3.11") {
    Write-Status "backend\.venv is not Python 3.11. Recreate it with: py -3.11 -m venv .venv"
    exit 1
}

& $Python -c "import django, rest_framework, psutil, dotenv, corsheaders, prometheus_client"
if ($LASTEXITCODE -ne 0) {
    Write-Status "Backend packages are missing. From backend\, run: .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
    exit 1
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Status "backend\.env is missing. Copy .env.example to backend\.env and set DJANGO_SECRET_KEY."
    exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
    Write-Status "Node.js and npm must both be available on PATH."
    exit 1
}

if (-not (Test-Path -LiteralPath $Vite)) {
    Write-Status "Frontend dependencies are missing. From frontend\, run: npm install"
    exit 1
}

Push-Location -LiteralPath $BackendDir
try {
    & $Python manage.py check
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Django system checks failed. The server was not started."
        exit 1
    }
} finally {
    Pop-Location
}

$state = Read-State
if (-not $state) {
    $state = [pscustomobject]@{ backend = $null; frontend = $null }
}

function Resolve-Service {
    param(
        [string]$Name,
        [int]$Port,
        [scriptblock]$IsProjectProcess
    )
    $listeners = @(Get-ListeningPids -Port $Port)
    if ($listeners.Count -eq 0) {
        return [pscustomobject]@{ Action = "start"; Listener = $null }
    }

    $listener = $null
    foreach ($processId in $listeners) {
        $info = Get-ProcessInfo -ProcessId $processId
        if (Test-ProcessFamily -Proc $info -Matcher $IsProjectProcess) {
            $listener = $info
            break
        }
    }

    if (-not $listener) {
        $processId = $listeners[0]
        $info = Get-ProcessInfo -ProcessId $processId
        $processName = "unknown"
        if ($info) {
            $processName = [string]$info.Name
        }
        Write-Status "Port $Port is already used by $processName (PID $processId)."
        Write-Status "That process is not the ServerOps $Name server for this project."
        Write-Status "This script will not stop it. Free the port, then run the script again."
        exit 1
    }

    return [pscustomobject]@{ Action = "reuse"; Listener = $listener }
}

$backendPlan = Resolve-Service -Name "Django" -Port 8000 -IsProjectProcess { param($Proc) Test-BackendProcess $Proc }
$frontendPlan = Resolve-Service -Name "Vite" -Port 5173 -IsProjectProcess { param($Proc) Test-FrontendProcess $Proc }

if ($backendPlan.Action -eq "start") {
    Write-Status "Starting Django at http://127.0.0.1:8000/"
    $backendCommand = "Set-Location -LiteralPath $(Quote-Literal $BackendDir); & $(Quote-Literal $Python) manage.py runserver 127.0.0.1:8000"
    $started = Start-ProjectWindow -Command $backendCommand
    $info = $null
    for ($attempt = 0; $attempt -lt 20 -and -not $info; $attempt++) {
        Start-Sleep -Milliseconds 200
        $info = Get-ProcessInfo -ProcessId $started.Id
    }
    if (-not $info) {
        Write-Status "Django did not stay running. Look at the Django window for the error."
        exit 1
    }
    $state | Add-Member -NotePropertyName backend -NotePropertyValue (New-Record $info) -Force
} elseif (Test-OwnedListener -Record $state.backend -Listener $backendPlan.Listener) {
    Write-Status "Django is already running from this startup script."
} else {
    Write-Status "Django is already running for this project. The stop script will not close it, because this script did not start it."
    $state | Add-Member -NotePropertyName backend -NotePropertyValue $null -Force
}

if ($frontendPlan.Action -eq "start") {
    Write-Status "Starting the dashboard at http://127.0.0.1:5173/"
    $frontendCommand = "Set-Location -LiteralPath $(Quote-Literal $FrontendDir); & $(Quote-Literal $node.Source) $(Quote-Literal $Vite) --host 127.0.0.1 --port 5173 --strictPort"
    $started = Start-ProjectWindow -Command $frontendCommand
    $info = $null
    for ($attempt = 0; $attempt -lt 20 -and -not $info; $attempt++) {
        Start-Sleep -Milliseconds 200
        $info = Get-ProcessInfo -ProcessId $started.Id
    }
    if (-not $info) {
        Write-Status "The dashboard process did not stay running. Look at the Vite window for the error."
        if ($backendPlan.Action -eq "start") {
            Stop-OwnedProcess -Record $state.backend
            $state | Add-Member -NotePropertyName backend -NotePropertyValue $null -Force
        }
        Write-State $state
        exit 1
    }
    $state | Add-Member -NotePropertyName frontend -NotePropertyValue (New-Record $info) -Force
} elseif (Test-OwnedListener -Record $state.frontend -Listener $frontendPlan.Listener) {
    Write-Status "The dashboard is already running from this startup script."
} else {
    Write-Status "The dashboard is already running for this project. The stop script will not close it, because this script did not start it."
    $state | Add-Member -NotePropertyName frontend -NotePropertyValue $null -Force
}

Write-State $state

Write-Status "Waiting for Django and the dashboard to answer."
$health = Wait-ForUrl -Url "http://127.0.0.1:8000/api/health/"
$dashboard = Wait-ForUrl -Url "http://127.0.0.1:5173/"
if (-not $health -or -not $dashboard) {
    Write-Status "A service did not become reachable. Django health and the dashboard must both return HTTP 200."
    Write-Status "Look at the ServerOps console windows, then run stop-serverops.ps1 if you want to close the processes this script started."
    exit 1
}

if ([string]$health.Content -notmatch "serverops-api") {
    Write-Status "Port 8000 answered, but it is not the ServerOps health API."
    exit 1
}

Start-Process "http://127.0.0.1:5173/"
Write-Status ""
Write-Status "ServerOps is running."
Write-Status "Dashboard:     http://127.0.0.1:5173/"
Write-Status "Django health: http://127.0.0.1:8000/api/health/"
Write-Status "Stop with:     powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\stop-serverops.ps1`""
exit 0
