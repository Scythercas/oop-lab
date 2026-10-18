# Spike for T2/T3 (docs/04_詳細設計書.md section 12).
# Drives Excel through COM: imports VBA modules, compiles them via the VBE command bar,
# and runs them through Application.Run. A watchdog kills Excel if a modal dialog blocks it.
# The AccessVBOM setting is enabled only while this script runs and is set back to 0 at the end.
param([int]$TimeoutSec = 30)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$regPath = 'HKCU:\Software\Microsoft\Office\16.0\Excel\Security'
$cp932 = [System.Text.Encoding]::GetEncoding(932)
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Log([string]$Message) {
    $line = (Get-Date -Format 'HH:mm:ss.fff') + ' ' + $Message
    [IO.File]::AppendAllText((Join-Path $here 'steps.log'), $line + "`n", $utf8)
}

function Convert-Module([string]$Src, [string]$DstDir) {
    $name = [IO.Path]::GetFileNameWithoutExtension($Src)
    $ext = [IO.Path]::GetExtension($Src)
    $text = [IO.File]::ReadAllText($Src, $utf8).Replace("`r`n", "`n").TrimEnd("`n")
    $lines = foreach ($line in $text.Split("`n")) {
        if ($line -match '^(\s*)Debug\.Print\s*$') { $Matches[1] + 'VerifyCapture.WriteLine ""' }
        elseif ($line -match '^(\s*)Debug\.Print\s+(.+)$') { $Matches[1] + 'VerifyCapture.WriteLine (' + $Matches[2] + ')' }
        else { $line }
    }
    if ($ext -eq '.cls') {
        $header = @('VERSION 1.0 CLASS', 'BEGIN', '  MultiUse = -1  ''True', 'END',
            ('Attribute VB_Name = "' + $name + '"'), 'Attribute VB_GlobalNameSpace = False',
            'Attribute VB_Creatable = False', 'Attribute VB_PredeclaredId = False', 'Attribute VB_Exposed = False')
    } else {
        $header = @('Attribute VB_Name = "' + $name + '"')
    }
    $out = ((@($header) + @($lines)) -join "`r`n") + "`r`n"
    $bytes = $cp932.GetBytes($out)
    if ($cp932.GetString($bytes) -ne $out) { throw "Not representable in CP932: $Src" }
    $dst = Join-Path $DstDir ([IO.Path]::GetFileName($Src))
    [IO.File]::WriteAllBytes($dst, $bytes)
    return $dst
}

function Start-Excel {
    $before = @(Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $after = @(Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $newPid = @($after | Where-Object { $before -notcontains $_ })[0]
    return @{ App = $xl; Pid = $newPid }
}

function Invoke-Guarded([scriptblock]$Action, [int]$ExcelPid, [int]$Seconds) {
    $flag = Join-Path $env:TEMP ('vba-spike-' + [guid]::NewGuid() + '.done')
    $job = Start-Job -ArgumentList $ExcelPid, $Seconds, $flag -ScriptBlock {
        param($procId, $sec, $flagPath)
        $deadline = (Get-Date).AddSeconds($sec)
        while ((Get-Date) -lt $deadline) {
            if (Test-Path $flagPath) { return 'done' }
            Start-Sleep -Milliseconds 200
        }
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        return 'killed'
    }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $value = & $Action
        $res = [ordered]@{ Ok = $true; Value = $value }
    } catch {
        $res = [ordered]@{ Ok = $false; Error = $_.Exception.Message }
    }
    New-Item -ItemType File -Path $flag | Out-Null
    $jobOut = Receive-Job -Job $job -Wait -AutoRemoveJob
    Remove-Item $flag -ErrorAction SilentlyContinue
    $res.Killed = ($jobOut -eq 'killed')
    $res.Ms = $sw.ElapsedMilliseconds
    return $res
}

function Test-Case([hashtable]$Excel, [string]$CaseName, [string]$Mode) {
    $caseDir = Join-Path $here ('cases\' + $CaseName)
    $tmp = Join-Path $env:TEMP ('vba-spike-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $files = @(Get-ChildItem -Path $caseDir -Include '*.bas', '*.cls' -Recurse) +
             @(Get-ChildItem -Path (Join-Path $here 'templates') -Include '*.bas' -Recurse)
    $converted = foreach ($f in $files) { Convert-Module $f.FullName $tmp }

    $xl = $Excel.App
    $wb = $xl.Workbooks.Add()
    Log "  workbook added: $($wb.Name)"
    foreach ($p in $converted) { [void]$wb.VBProject.VBComponents.Import($p) }
    Log "  imported: $($wb.VBProject.VBComponents.Count) components"

    $result = [ordered]@{ Case = $CaseName; Mode = $Mode }
    $killed = $false
    if ($Mode -eq 'compile' -or $Mode -eq 'compile-then-run') {
        $xl.VBE.ActiveVBProject = $wb.VBProject
        $ctrl = $xl.VBE.CommandBars.FindControl(1, 578)
        Log "  compile control: $(if ($null -eq $ctrl) { 'null' } else { $ctrl.Caption + ' enabled=' + $ctrl.Enabled })"
        $result.CompileEnabledBefore = $ctrl.Enabled
        $r = Invoke-Guarded { $ctrl.Execute() } $Excel.Pid $TimeoutSec
        Log "  compile done: ok=$($r.Ok) killed=$($r.Killed) ms=$($r.Ms)"
        $result.CompileCall = $r
        $killed = $r.Killed
        if (-not $killed) { $result.CompileEnabledAfter = $ctrl.Enabled }
    }
    if (-not $killed -and $Mode -ne 'compile') {
        $macro = "'" + $wb.Name + "'!VerifyRunner.RunMain"
        Log "  run: $macro"
        $r = Invoke-Guarded { $xl.Run($macro) } $Excel.Pid $TimeoutSec
        Log "  run done: ok=$($r.Ok) killed=$($r.Killed) ms=$($r.Ms)"
        $result.RunCall = $r
        $killed = $r.Killed
        $expectedPath = Join-Path $caseDir 'expected-output.txt'
        if ($r.Ok -and (Test-Path $expectedPath)) {
            $expected = [IO.File]::ReadAllText($expectedPath, $utf8).Replace("`r`n", "`n")
            $result.OutputMatches = ([string]$r.Value).Replace("`r`n", "`n") -ceq $expected
        }
    }
    if (-not $killed) { $wb.Close($false) }
    Remove-Item $tmp -Recurse -Force
    $result.Killed = $killed
    return $result
}

$original = $null
try { $original = (Get-ItemProperty -Path $regPath -Name AccessVBOM -ErrorAction Stop).AccessVBOM } catch { }
if ($original -eq 1) { Write-Host 'WARNING: AccessVBOM was already enabled before this check.' }
if (-not (Test-Path $regPath)) { New-Item -Path $regPath | Out-Null }
New-ItemProperty -Path $regPath -Name AccessVBOM -Value 1 -PropertyType DWord -Force | Out-Null

$results = @()
$excel = $null
try {
    $plan = @(
        @('ok', 'compile-then-run'),
        @('runtime-error', 'compile-then-run'),
        @('compile-error', 'compile'),
        @('compile-error', 'run')
    )
    foreach ($p in $plan) {
        if ($null -eq $excel) { $excel = Start-Excel; Log "Excel started pid=$($excel.Pid)" }
        Log "case=$($p[0]) mode=$($p[1])"
        try {
            $r = Test-Case $excel $p[0] $p[1]
        } catch {
            $r = [ordered]@{ Case = $p[0]; Mode = $p[1]; Killed = $true; CaseError = $_.Exception.Message;
                             ExcelAlive = [bool](Get-Process -Id $excel.Pid -ErrorAction SilentlyContinue) }
        }
        Log ("  -> " + (([pscustomobject]$r) | ConvertTo-Json -Depth 4 -Compress))
        $results += [pscustomobject]$r
        if ($r.Killed) {
            try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel.App) } catch { }
            Stop-Process -Id $excel.Pid -Force -ErrorAction SilentlyContinue
            $excel = $null
        }
    }
} finally {
    if ($null -ne $excel) {
        try { $excel.App.Quit() } catch { }
        try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel.App) } catch { }
    }
    New-ItemProperty -Path $regPath -Name AccessVBOM -Value 0 -PropertyType DWord -Force | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$json = $results | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $here 'result.json'), $json, $utf8)
$json
'AccessVBOM after: ' + (Get-ItemProperty -Path $regPath -Name AccessVBOM).AccessVBOM
'Excel processes left: ' + @(Get-Process EXCEL -ErrorAction SilentlyContinue).Count
