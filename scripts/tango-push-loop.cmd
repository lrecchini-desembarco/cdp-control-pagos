@echo off
rem Watchdog del push de Tango a KV: si node sale, lo relanza.
rem Node por RUTA COMPLETA (en la sesión S4U sin login el PATH puede no tenerlo).
rem Delay con ping (timeout no funciona sin consola en la sesión 0).
cd /d C:\Users\siste\Downloads\ds-cdp-dashboard
:loop
"C:\Program Files\nodejs\node.exe" scripts\tango-push.mjs >> tango-push.log 2>&1
ping -n 16 127.0.0.1 >nul
goto loop
