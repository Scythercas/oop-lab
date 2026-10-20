Option Explicit

Public Sub Main()
    Dim gearbox As Transmission
    Set gearbox = New Transmission
    Dim lever As ShiftLever
    Set lever = New ShiftLever
    lever.Init gearbox
    Dim button As ParkButton
    Set button = New ParkButton
    button.Init gearbox

    lever.Request "N", 0, False
    lever.Request "D", 0, False
    lever.Request "D", 0, True
    lever.Request "R", 20, True
    button.Press 0, True
End Sub
