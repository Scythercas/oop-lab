Option Explicit

' 変速機。シフト位置（P・R・N・D）を持つ
Private mPosition As String

Private Sub Class_Initialize()
    mPosition = "P"
End Sub

Public Property Get Position() As String
    Position = mPosition
End Property

Public Property Let Position(ByVal value As String)
    mPosition = value
End Property
