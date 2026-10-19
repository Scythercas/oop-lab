Option Explicit

' VBA 確認ツールが取り込む、出力を集めるモジュール（詳細設計書 §7.3）。
' 確認用の写しの中では、Debug.Print がこのモジュールの WriteLine の呼び出しに置き換わる。

Private mBuffer As String

Public Sub Reset()
    mBuffer = ""
End Sub

Public Sub WriteLine(ByVal value As Variant)
    ' Debug.Print に数値を渡すと先頭に空白が付くため、文字列以外は失敗として記録する
    If VarType(value) <> vbString Then
        mBuffer = mBuffer & "ERROR: Debug.Print に文字列以外（" & TypeName(value) & "）を渡しています" & vbLf
    Else
        mBuffer = mBuffer & value & vbLf
    End If
End Sub

Public Function GetOutput() As String
    GetOutput = mBuffer
End Function
