Option Explicit

' 変速機。シフト位置（P・R・N・D）を持ち、切り替えの規則を守る
Private mPosition As String

Private Sub Class_Initialize()
    mPosition = "P"
End Sub

Public Property Get Position() As String
    Position = mPosition
End Property

' 規則に合えば切り替えて True を、合わなければ切り替えずに False を返す
Public Function ShiftTo(ByVal requested As String, ByVal speed As Long, ByVal brakePressed As Boolean) As Boolean
    ' 走行中は R に入れない
    If requested = "R" And speed <> 0 Then
        ShiftTo = False
        Exit Function
    End If
    ' N から D に入れるときは、ブレーキを踏んでいること
    If mPosition = "N" And requested = "D" And Not brakePressed Then
        ShiftTo = False
        Exit Function
    End If
    mPosition = requested
    ShiftTo = True
End Function
