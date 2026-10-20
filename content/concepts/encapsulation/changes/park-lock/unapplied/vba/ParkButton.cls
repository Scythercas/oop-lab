Option Explicit

' P ボタン。押されると P への切り替えを要求する
Private mTransmission As Transmission

Public Sub Init(ByVal target As Transmission)
    Set mTransmission = target
End Sub

Public Sub Press(ByVal speed As Long)
    Dim previous As String
    previous = mTransmission.Position
    ' 走行中は P に入れない
    If speed <> 0 Then
        Debug.Print previous & "→P " & CStr(speed) & "km/h 拒否 現在" & mTransmission.Position
        Exit Sub
    End If
    mTransmission.Position = "P"
    Debug.Print previous & "→P " & CStr(speed) & "km/h 受付 現在" & mTransmission.Position
End Sub
