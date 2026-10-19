# VBA 確認ツールのうち、Excel を使わない部分の単体テスト（テスト計画書 UT-VBA-01〜05）。Pester 5 で動かす。
BeforeAll {
    Import-Module (Join-Path (Split-Path -Parent $PSScriptRoot) 'VbaVerify.psm1') -Force
}

Describe 'ConvertTo-VbaImportText' {
    It 'UT-VBA-01: Debug.Print を出力収集の呼び出しに置き換え、文字列の中の Debug.Print は変えない' {
        $source = "Option Explicit`n`nPublic Sub Main()`n    Debug.Print ""前照灯"" & "" 点灯""`n    Debug.Print`n    x = ""Debug.Print のまま""`nEnd Sub`n"
        $lines = (ConvertTo-VbaImportText 'Program.bas' $source) -split "`r`n"
        $lines | Should -Contain '    VerifyCapture.WriteLine ("前照灯" & " 点灯")'
        $lines | Should -Contain '    VerifyCapture.WriteLine ""'
        $lines | Should -Contain '    x = "Debug.Print のまま"'
    }

    It 'UT-VBA-02: クラスモジュールに9行の見出しを付ける' {
        $lines = (ConvertTo-VbaImportText 'Lamp.cls' "Option Explicit`n") -split "`r`n"
        $lines[0..9] | Should -Be @(
            'VERSION 1.0 CLASS', 'BEGIN', '  MultiUse = -1  ''True', 'END', 'Attribute VB_Name = "Lamp"',
            'Attribute VB_GlobalNameSpace = False', 'Attribute VB_Creatable = False',
            'Attribute VB_PredeclaredId = False', 'Attribute VB_Exposed = False', 'Option Explicit')
    }

    It 'UT-VBA-02: 標準モジュールには名前の行だけを付け、改行を CRLF にする' {
        ConvertTo-VbaImportText 'Program.bas' "Option Explicit`n" | Should -BeExactly "Attribute VB_Name = ""Program""`r`nOption Explicit`r`n"
    }
}

Describe 'ConvertTo-Cp932Bytes' {
    It 'UT-VBA-03: Shift_JIS で表せる日本語は変換できる' {
        (ConvertTo-Cp932Bytes '前照灯' 'a.bas').Length | Should -Be 6
    }

    It 'UT-VBA-03: Shift_JIS で表せない文字があると失敗する' {
        { ConvertTo-Cp932Bytes ('吉' + [char]0xD842 + [char]0xDFB7) 'a.bas' } | Should -Throw '*CP932*'
    }
}

Describe 'Invoke-WithAccessVbom' {
    BeforeEach {
        Mock -ModuleName VbaVerify Set-AccessVbom { }
    }

    It 'UT-VBA-04: 処理が失敗しても、設定を無効（0）に戻す' {
        Mock -ModuleName VbaVerify Get-AccessVbom { 0 }
        { Invoke-WithAccessVbom { throw 'boom' } } | Should -Throw 'boom'
        Should -Invoke -ModuleName VbaVerify Set-AccessVbom -Times 1 -Exactly -ParameterFilter { $Value -eq 1 }
        Should -Invoke -ModuleName VbaVerify Set-AccessVbom -Times 1 -Exactly -ParameterFilter { $Value -eq 0 }
    }

    It 'UT-VBA-05: 確認の前から有効だったことを返す' {
        Mock -ModuleName VbaVerify Get-AccessVbom { 1 }
        $outcome = Invoke-WithAccessVbom { 'ok' }
        $outcome.WasEnabled | Should -BeTrue
        $outcome.Result | Should -Be 'ok'
        Should -Invoke -ModuleName VbaVerify Set-AccessVbom -Times 1 -Exactly -ParameterFilter { $Value -eq 0 }
    }
}
