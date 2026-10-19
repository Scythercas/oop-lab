Option Explicit

' 試験用の道具。工場の検査で、規則を確かめずにシフト位置を設定する
Private mTransmission As Transmission

Public Sub Init(ByVal target As Transmission)
    Set mTransmission = target
End Sub

Public Sub Force(ByVal requested As String, ByVal speed As Long)
    Dim previous As String
    previous = mTransmission.Position
    mTransmission.ForceForTest requested
    Debug.Print previous & "→" & requested & " " & CStr(speed) & "km/h 試験設定 現在" & mTransmission.Position
End Sub
