# VBA 確認ツールのうち、Excel を操作する部分（詳細設計書 §7）。
# 対象の列挙・ハッシュ値・期待結果との照合・確認記録は、Node.js 側（verify.ts）が行う。
# Windows PowerShell 5.1 で動くように書く。このファイルは UTF-8（BOM 付き）で保存する。
Set-StrictMode -Version 2.0

$script:RegistryPath = 'HKCU:\Software\Microsoft\Office\16.0\Excel\Security'
$script:Utf8 = New-Object System.Text.UTF8Encoding($false)
$script:Cp932 = [System.Text.Encoding]::GetEncoding(932)
# VBE の「VBAProject のコンパイル」（M0 の T2 で確認）
$script:CompileControlId = 578

# --- Excel の設定「VBA プロジェクト オブジェクト モデルへのアクセスを信頼する」 ---

function Get-AccessVbom {
    try {
        return [int](Get-ItemProperty -Path $script:RegistryPath -Name AccessVBOM -ErrorAction Stop).AccessVBOM
    } catch {
        return 0
    }
}

function Set-AccessVbom([int]$Value) {
    if (-not (Test-Path $script:RegistryPath)) { New-Item -Path $script:RegistryPath | Out-Null }
    New-ItemProperty -Path $script:RegistryPath -Name AccessVBOM -Value $Value -PropertyType DWord -Force | Out-Null
}

# 設定を有効にして処理を行い、終わったら（失敗したときも）無効に戻す（要件定義書 NFR-10）
function Invoke-WithAccessVbom([scriptblock]$Body) {
    $wasEnabled = (Get-AccessVbom) -eq 1
    Set-AccessVbom 1
    try {
        $result = & $Body
    } finally {
        Set-AccessVbom 0
    }
    return [pscustomobject]@{ WasEnabled = $wasEnabled; Result = $result }
}

# --- 確認用の写しの加工（§7.3） ---

# Debug.Print を出力収集の呼び出しに置き換え、取り込み用の見出し行を付け、改行を CRLF にする
function ConvertTo-VbaImportText([string]$FileName, [string]$Source) {
    $name = [IO.Path]::GetFileNameWithoutExtension($FileName)
    $extension = [IO.Path]::GetExtension($FileName).ToLowerInvariant()
    $text = $Source.Replace("`r`n", "`n").TrimEnd("`n")
    $lines = foreach ($line in $text.Split("`n")) {
        if ($line -match '^(\s*)Debug\.Print\s*$') { $Matches[1] + 'VerifyCapture.WriteLine ""' }
        elseif ($line -match '^(\s*)Debug\.Print\s+(.+)$') { $Matches[1] + 'VerifyCapture.WriteLine (' + $Matches[2] + ')' }
        else { $line }
    }
    if ($extension -eq '.cls') {
        $header = @(
            'VERSION 1.0 CLASS', 'BEGIN', '  MultiUse = -1  ''True', 'END',
            ('Attribute VB_Name = "' + $name + '"'), 'Attribute VB_GlobalNameSpace = False',
            'Attribute VB_Creatable = False', 'Attribute VB_PredeclaredId = False', 'Attribute VB_Exposed = False')
    } else {
        $header = @('Attribute VB_Name = "' + $name + '"')
    }
    return ((@($header) + @($lines)) -join "`r`n") + "`r`n"
}

# Excel が取り込める Shift_JIS（CP932）にする。表せない文字があれば失敗にする
function ConvertTo-Cp932Bytes([string]$Text, [string]$Label) {
    $bytes = $script:Cp932.GetBytes($Text)
    if ($script:Cp932.GetString($bytes) -ne $Text) { throw "CP932 cannot represent a character in $Label" }
    return , $bytes
}

# --- Excel の操作 ---

function Start-ExcelSession {
    $before = @(Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $after = @(Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $processId = @($after | Where-Object { $before -notcontains $_ })[0]
    return @{ App = $excel; ProcessId = $processId; Version = "$($excel.Version).$($excel.Build)" }
}

function Stop-ExcelSession([hashtable]$Session) {
    try { $Session.App.Quit() } catch { }
    try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($Session.App) } catch { }
    if ($Session.ProcessId) { Stop-Process -Id $Session.ProcessId -Force -ErrorAction SilentlyContinue }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

# 時間切れになったら Excel を強制終了する見張りを付けて、処理を行う（§7.4）
function Invoke-Guarded([scriptblock]$Action, [int]$ProcessId, [int]$Seconds) {
    $flag = Join-Path $env:TEMP ('vba-verify-' + [guid]::NewGuid() + '.done')
    $job = Start-Job -ArgumentList $ProcessId, $Seconds, $flag -ScriptBlock {
        param($targetId, $limit, $flagPath)
        $deadline = (Get-Date).AddSeconds($limit)
        while ((Get-Date) -lt $deadline) {
            if (Test-Path $flagPath) { return 'done' }
            Start-Sleep -Milliseconds 200
        }
        Stop-Process -Id $targetId -Force -ErrorAction SilentlyContinue
        return 'killed'
    }
    try {
        $value = & $Action
        $result = @{ Ok = $true; Value = $value; Error = '' }
    } catch {
        $result = @{ Ok = $false; Value = $null; Error = $_.Exception.Message }
    }
    New-Item -ItemType File -Path $flag | Out-Null
    $watch = Receive-Job -Job $job -Wait -AutoRemoveJob
    Remove-Item $flag -ErrorAction SilentlyContinue
    $result.TimedOut = ($watch -eq 'killed')
    return $result
}

# 1つの対象を、新しいブックに取り込み、コンパイルし、run なら実行する（§7.4）
function Test-VbaTarget([hashtable]$Session, $Target, [string]$TemplatesDir, [int]$TimeoutSec) {
    $result = [ordered]@{ id = $Target.id; compiled = $false; ran = $false; output = ''; error = ''; timedOut = $false }
    $work = Join-Path $env:TEMP ('vba-verify-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        $sources = @($Target.files | ForEach-Object { Join-Path $Target.dir $_ })
        if ($Target.kind -eq 'run') {
            $sources += @(Get-ChildItem -Path $TemplatesDir -Filter '*.bas' | ForEach-Object { $_.FullName })
        }
        $paths = foreach ($source in $sources) {
            $fileName = [IO.Path]::GetFileName($source)
            $text = ConvertTo-VbaImportText $fileName ([IO.File]::ReadAllText($source, $script:Utf8))
            $path = Join-Path $work $fileName
            [IO.File]::WriteAllBytes($path, (ConvertTo-Cp932Bytes $text $fileName))
            $path
        }

        $excel = $Session.App
        $workbook = $excel.Workbooks.Add()
        foreach ($path in $paths) { [void]$workbook.VBProject.VBComponents.Import($path) }

        # コンパイルに成功するとメニューが無効になる。エラーでは有効のまま残る（T2）
        $excel.VBE.ActiveVBProject = $workbook.VBProject
        $control = $excel.VBE.CommandBars.FindControl(1, $script:CompileControlId)
        $compile = Invoke-Guarded { $control.Execute() } $Session.ProcessId $TimeoutSec
        if ($compile.TimedOut) {
            $result.timedOut = $true
            $result.error = 'compile timed out'
            return [pscustomobject]$result
        }
        $result.compiled = $compile.Ok -and -not $control.Enabled
        if (-not $result.compiled) { $result.error = 'compile error' }

        # コンパイルエラーのまま実行すると Excel が異常終了するので、実行しない（T2）
        if ($Target.kind -eq 'run' -and $result.compiled) {
            $macro = "'" + $workbook.Name + "'!VerifyRunner.RunMain"
            $run = Invoke-Guarded { $excel.Run($macro) } $Session.ProcessId $TimeoutSec
            if ($run.TimedOut) {
                $result.timedOut = $true
                $result.error = 'run timed out'
                return [pscustomobject]$result
            }
            $result.ran = $run.Ok
            $result.output = [string]$run.Value
            if (-not $run.Ok) { $result.error = $run.Error }
        }
        $workbook.Close($false)
        return [pscustomobject]$result
    } finally {
        Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Export-ModuleMember -Function Get-AccessVbom, Set-AccessVbom, Invoke-WithAccessVbom, ConvertTo-VbaImportText, ConvertTo-Cp932Bytes, Start-ExcelSession, Stop-ExcelSession, Invoke-Guarded, Test-VbaTarget
