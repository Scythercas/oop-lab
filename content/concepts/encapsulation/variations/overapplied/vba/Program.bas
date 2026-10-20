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

    lever.Request "D", 0
    lever.Request "R", 20
    lever.Request "N", 15
    button.Press 15
    lever.Request "D", 0
    lever.Request "P", 5
End Sub
