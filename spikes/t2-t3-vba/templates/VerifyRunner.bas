Option Explicit

Public Function RunMain() As String
    VerifyCapture.Reset
    On Error GoTo Failed
    Program.Main
    RunMain = VerifyCapture.GetOutput()
    Exit Function
Failed:
    RunMain = VerifyCapture.GetOutput() & "ERROR: " & CStr(Err.Number) & " " & Err.Description & vbLf
End Function
