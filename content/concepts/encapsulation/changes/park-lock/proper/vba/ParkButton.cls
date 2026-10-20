Option Explicit

' P ボタン。押されると P への切り替えを要求する
Private mTransmission As Transmission

Public Sub Init(ByVal target As Transmission)
    Set mTransmission = target
End Sub

Public Sub Press(ByVal speed As Long)
    Dim previous As String
    previous = mTransmission.Position
    Dim accepted As Boolean
    accepted = mTransmission.ShiftTo("P", speed)
    Debug.Print previous & "→P " & CStr(speed) & "km/h " & IIf(accepted, "受付", "拒否") & " 現在" & mTransmission.Position
End Sub
