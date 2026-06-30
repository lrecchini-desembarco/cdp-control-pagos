' Lanza el Tango bridge sin ventana de consola (para la tarea programada de usuario).
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\scripts
repo = fso.GetParentFolderName(scriptDir)                      ' raiz del repo
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = repo
sh.Run "node """ & repo & "\scripts\tango-bridge.mjs""", 0, False
