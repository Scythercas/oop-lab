# VBA 確認ツールの Excel の操作の入口（詳細設計書 §7）。直接ではなく、npm run vba:verify から呼ばれる。
# Manifest: Node.js が用意した確認対象の一覧。Results: 結果を書き出すファイル。
param(
    [Parameter(Mandatory = $true)][string]$Manifest,
    [Parameter(Mandatory = $true)][string]$Results,
    [int]$TimeoutSec = 30
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'VbaVerify.psm1') -Force

$utf8 = New-Object System.Text.UTF8Encoding($false)
$plan = [IO.File]::ReadAllText($Manifest, $utf8) | ConvertFrom-Json
$templates = Join-Path $PSScriptRoot 'templates'

$outcome = Invoke-WithAccessVbom {
    $session = $null
    $version = ''
    $list = @()
    try {
        foreach ($target in @($plan.targets)) {
            if ($null -eq $session) {
                $session = Start-ExcelSession
                $version = $session.Version
            }
            Write-Host ('[' + $target.kind + '] ' + $target.target)
            try {
                $item = Test-VbaTarget $session $target $templates $TimeoutSec
            } catch {
                $item = [pscustomobject]@{ id = $target.id; compiled = $false; ran = $false; output = ''; error = $_.Exception.Message; timedOut = $false }
                Stop-ExcelSession $session
                $session = $null
            }
            $list += $item
            if ($item.timedOut) {
                Stop-ExcelSession $session
                $session = $null
            }
        }
    } finally {
        if ($null -ne $session) { Stop-ExcelSession $session }
    }
    [pscustomobject]@{ excelVersion = $version; targets = $list }
}

$out = [ordered]@{
    excelVersion = $outcome.Result.excelVersion
    accessVbomWasEnabled = $outcome.WasEnabled
    targets = @($outcome.Result.targets)
}
[IO.File]::WriteAllText($Results, (ConvertTo-Json -InputObject $out -Depth 5), $utf8)
