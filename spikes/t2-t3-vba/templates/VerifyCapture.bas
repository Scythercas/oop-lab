Option Explicit

Private mBuffer As String

Public Sub Reset()
    mBuffer = ""
End Sub

Public Sub WriteLine(ByVal text As String)
    mBuffer = mBuffer & text & vbLf
End Sub

Public Function GetOutput() As String
    GetOutput = mBuffer
End Function
