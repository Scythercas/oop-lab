Option Explicit

' VBA 確認ツールが取り込む、実行の入口を呼ぶモジュール（詳細設計書 §7.3）。
' 実行時エラーをダイアログにせず、集めた出力の後ろに「ERROR: 番号 説明」として返す。

Public Function RunMain() As String
    VerifyCapture.Reset
    On Error GoTo Failed
    Program.Main
    RunMain = VerifyCapture.GetOutput()
    Exit Function
Failed:
    RunMain = VerifyCapture.GetOutput() & "ERROR: " & CStr(Err.Number) & " " & Err.Description & vbLf
End Function
