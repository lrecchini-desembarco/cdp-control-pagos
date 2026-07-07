' Lanza el watchdog del túnel del bridge de Tango sin ventana.
' Mantiene el túnel Cloudflare vivo y publica la URL vigente en el dashboard.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\scripts
repo = fso.GetParentFolderName(scriptDir)                      ' raiz del repo
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = repo
sh.Run "node """ & repo & "\scripts\tango-tunel-loop.mjs""", 0, False
