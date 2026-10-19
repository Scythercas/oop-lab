Option Explicit

' シフトレバー。運転者が選んだ位置への切り替えを要求する
Private mTransmission As Transmission

Public Sub Init(ByVal target As Transmission)
    Set mTransmission = target
End Sub

Public Sub Request(ByVal requested As String, ByVal speed As Long)
    Dim previous As String
    previous = mTransmission.Position
    Dim accepted As Boolean
    accepted = mTransmission.ShiftTo(requested, speed)
    Debug.Print previous & "→" & requested & " " & CStr(speed) & "km/h " & IIf(accepted, "受付", "拒否") & " 現在" & mTransmission.Position
End Sub
