' Lanza el push de Tango a KV sin ventana (autostart por login + arranque manual).
' Corre el loop .cmd que relanza node si se cae.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\scripts
repo = fso.GetParentFolderName(scriptDir)                      ' raiz del repo
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = repo
sh.Run "cmd /c """ & repo & "\scripts\tango-push-loop.cmd""", 0, False
