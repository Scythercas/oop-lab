Option Explicit

' シフトレバー。運転者が選んだ位置への切り替えを要求する
Private mTransmission As Transmission

Public Sub Init(ByVal target As Transmission)
    Set mTransmission = target
End Sub

Public Sub Request(ByVal requested As String, ByVal speed As Long)
    Dim previous As String
    previous = mTransmission.Position
    ' 走行中は R と P に入れない
    If (requested = "R" Or requested = "P") And speed <> 0 Then
        Debug.Print previous & "→" & requested & " " & CStr(speed) & "km/h 拒否 現在" & mTransmission.Position
        Exit Sub
    End If
    mTransmission.Position = requested
    Debug.Print previous & "→" & requested & " " & CStr(speed) & "km/h 受付 現在" & mTransmission.Position
End Sub
