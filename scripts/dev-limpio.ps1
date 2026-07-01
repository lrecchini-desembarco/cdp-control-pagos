<#
  Reinicia el dev de Next LIMPIO. Resuelve de un tiro los errores tipicos de
  desarrollo en Windows: ChunkLoadError, "Cannot find the middleware module",
  404/500 en rutas que existen. Casi siempre son .next corrupto + varios dev
  servers corriendo, NO el codigo.

  Que hace:
   1) Mata todos los procesos node que escuchan en los puertos 3000-3010.
   2) Borra .next (y node_modules/.cache).
   3) Arranca UN solo dev limpio.

  Uso:  npm run dev:limpio     (o: powershell -ExecutionPolicy Bypass -File scripts\dev-limpio.ps1)
  Despues, en el navegador: Ctrl+Shift+R (hard refresh) para soltar chunks viejos.
#>
$ErrorActionPreference = "SilentlyContinue"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Output "1) Deteniendo dev servers (puertos 3000-3010)..."
$pids = 3000..3010 | ForEach-Object { try { (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction Stop).OwningProcess } catch {} } | Sort-Object -Unique
foreach ($id in $pids) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -match "node") { Stop-Process -Id $id -Force; Write-Output ("   detenido node PID " + $id) }
}
Start-Sleep -Seconds 2

Write-Output "2) Borrando .next y cache..."
Remove-Item -Recurse -Force (Join-Path $repo ".next") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $repo "node_modules\.cache") -ErrorAction SilentlyContinue

Write-Output "3) Arrancando UN dev limpio.  (en el navegador: Ctrl+Shift+R)"
Set-Location $repo
npm run dev
