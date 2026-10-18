Option Explicit

Public Sub Main()
    Dim t As Tire
    Set t = New Tire
    t.Init "左前", 230
    Debug.Print t.Describe()
    Debug.Print "合計 " & CStr(1 + 2)
End Sub
