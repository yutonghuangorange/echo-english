# Windows PowerShell 5.1 / PowerShell 7. Run from any directory.
# powershell -NoProfile -ExecutionPolicy Bypass -File .\start-karaoke.ps1
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ServerArguments)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:PYTHONUTF8 = '1'

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program exited with code $LASTEXITCODE" }
}

function Test-Python([string]$Program, [string[]]$Prefix) {
    # Missing py.exe versions are expected. PS 5.1 treats native stderr as errors.
    $ErrorActionPreference = 'Continue'
    $result = & $Program @Prefix -c "import sys,struct,platform; assert (3,10)<=sys.version_info[:2]<=(3,12) and struct.calcsize('P')==8 and platform.machine().lower() in ('amd64','x86_64'); print(sys.executable)" 2>$null
    if ($LASTEXITCODE -eq 0) { return [string]($result | Select-Object -Last 1) }
    return $null
}

function Test-Dependencies([string]$Program) {
    $ErrorActionPreference = 'Continue'
    & $Program -c 'import torch,torchaudio,soundfile,demucs,yt_dlp' 2>$null
    return $LASTEXITCODE -eq 0
}

function Test-CudaTorch([string]$Program) {
    $ErrorActionPreference = 'Continue'
    $variant = & $Program -c "import torch,torchaudio; print('cuda' if torch.__version__.split('+')[0] == torchaudio.__version__.split('+')[0] == '2.5.1' and torch.version.cuda else 'cpu')" 2>$null
    return $LASTEXITCODE -eq 0 -and $variant -eq 'cuda'
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'Use bash start-karaoke.sh on macOS / Linux.' }
    if ($ServerArguments -contains '--help') {
        Write-Host 'Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\start-karaoke.ps1 [--device auto|cpu|cuda|mps] [--cache PATH]'
        Write-Host 'Requires x64 Python 3.10-3.12, FFmpeg (with ffprobe), and Node.js 22+ or Deno on PATH.'
        exit 0
    }
    $python = $null
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        foreach ($version in @('-3.12', '-3.11', '-3.10')) {
            $python = Test-Python $launcher.Source @($version)
            if ($python) { break }
        }
    }
    if (-not $python) {
        foreach ($name in @('python.exe', 'python3.exe')) {
            $candidate = Get-Command $name -ErrorAction SilentlyContinue
            if ($candidate) { $python = Test-Python $candidate.Source @() }
            if ($python) { break }
        }
    }
    if (-not $python) { throw 'Install x64 Python 3.10-3.12 with pip and the Python launcher, then reopen PowerShell.' }
    foreach ($tool in @('ffmpeg', 'ffprobe')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            throw "Install FFmpeg and add its bin folder (including $tool.exe) to PATH, then reopen PowerShell."
        }
    }
    $jsReady = $false
    if (Get-Command node -ErrorAction SilentlyContinue) {
        & node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)"
        $jsReady = $LASTEXITCODE -eq 0
    }
    if (-not $jsReady -and -not (Get-Command deno -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js 22+ or Deno and reopen PowerShell.'
    }
    $venv = Join-Path $PSScriptRoot '.venv'
    $venvPython = Join-Path $venv 'Scripts\python.exe'
    if (-not (Test-Path $venvPython)) {
        if (Test-Path (Join-Path $venv 'pyvenv.cfg')) {
            throw 'This .venv belongs to another platform. Rename it and rerun; do not copy virtual environments between machines.'
        }
        Invoke-Checked $python @('-m', 'venv', $venv)
    }
    if (-not (Test-Python $venvPython @())) { throw 'Existing .venv needs x64 Python 3.10-3.12. Rename it and rerun.' }
    $requirements = Join-Path $PSScriptRoot 'karaoke\requirements.txt'
    $marker = Join-Path $venv '.echo-requirements'
    $ready = (Test-Path $marker) -and ([IO.File]::ReadAllText($marker) -ceq [IO.File]::ReadAllText($requirements))
    if ($ready) {
        $ready = Test-Dependencies $venvPython
    }
    if (-not $ready) {
        Write-Host 'Installing local dependencies. Downloads may take several minutes.'
        Invoke-Checked $venvPython @('-m', 'ensurepip', '--upgrade')
        Invoke-Checked $venvPython @('-m', 'pip', 'install', '--upgrade', 'pip')
        if (-not (Test-CudaTorch $venvPython)) {
            Invoke-Checked $venvPython @('-m', 'pip', 'install', '--index-url', 'https://download.pytorch.org/whl/cpu', 'torch==2.5.1', 'torchaudio==2.5.1')
        }
        Invoke-Checked $venvPython @('-m', 'pip', 'install', '-r', $requirements)
        Invoke-Checked $venvPython @('-m', 'pip', 'check')
        [IO.File]::WriteAllText($marker, [IO.File]::ReadAllText($requirements))
    }
    Write-Host 'Starting Echo. Keep this terminal open; Ctrl+C stops the service.'
    Invoke-Checked $venvPython (@((Join-Path $PSScriptRoot 'karaoke\server.py')) + $ServerArguments)
}
catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    [Console]::Error.WriteLine('Fix the error above and rerun. See karaoke/README.md and PLATFORM_SUPPORT.md.')
    exit 1
}
