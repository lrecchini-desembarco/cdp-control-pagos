<#
  Instala el Tango bridge como tarea de USUARIO (NO requiere admin).
  - Arranca al iniciar sesion tu usuario.
  - Corre oculto (sin ventana), via scripts\iniciar-bridge-oculto.vbs.
  - Sirve si la maquina queda con sesion iniciada.

  Para el arranque a nivel sistema (antes del login, recomendado para un
  servidor) usa scripts\instalar-bridge-servicio.ps1 en una consola ADMIN.

  USO (PowerShell normal, en la carpeta del repo):
    powershell -ExecutionPolicy Bypass -File scripts\instalar-bridge-usuario.ps1

  Desinstalar:
    Unregister-ScheduledTask -TaskName "CDP Tango Bridge (usuario)" -Confirm:$false
#>

$ErrorActionPreference = "Stop"
$TaskName = "CDP Tango Bridge (usuario)"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$vbs  = Join-Path $repo "scripts\iniciar-bridge-oculto.vbs"
if (-not (Test-Path $vbs)) { throw "No encuentro $vbs" }
if (-not (Test-Path (Join-Path $repo ".env.local"))) {
  Write-Warning "No hay .env.local en $repo (el bridge lo necesita: TANGO_DB_* + BRIDGE_SECRET)."
}

$action  = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + $vbs + '"') -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Bridge Tango CDP (tarea de usuario, arranca al iniciar sesion)" -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 4
Write-Output ("Estado: " + (Get-ScheduledTask -TaskName $TaskName).State)
try { $r = Invoke-RestMethod -Uri "http://localhost:8787/health" -TimeoutSec 6; Write-Output ("Health: OK " + ($r | ConvertTo-Json -Compress)) }
catch { Write-Warning "El bridge aun no responde en :8787. Revisa .env.local / que 'node' este en el PATH." }
Write-Output ""
Write-Output "Listo. El bridge arranca al iniciar sesion. Falta el tunel (docs/tango-bridge.md)."
