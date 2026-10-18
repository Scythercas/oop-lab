Option Explicit

Private mPosition As String
Private mPressure As Long

Public Sub Init(ByVal position As String, ByVal pressure As Long)
    mPosition = position
    mPressure = pressure
End Sub

Public Function Describe() As String
    Describe = mPosition & " " & CStr(mPressure) & "kPa"
End Function
