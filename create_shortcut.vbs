Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "C:\Users\Admin\Desktop\GYM Management App.lnk"
Set oLink = oWS.CreateShortCut(sLinkFile)
oLink.TargetPath = "C:\Users\Admin\Desktop\gym management\RUN_APP.bat"
oLink.WorkingDirectory = "C:\Users\Admin\Desktop\gym management"
oLink.Description = "GYM Management System - Click to start the application"
oLink.IconLocation = "C:\Users\Admin\Desktop\gym management\ChatGPT Image Feb 7, 2026, 01_44_55 PM.ico"
oLink.WindowStyle = 1
oLink.Save

WScript.Echo "Shortcut created successfully on Desktop!"
