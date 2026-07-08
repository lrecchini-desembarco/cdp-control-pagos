@echo off
rem Watchdog del push de Tango a KV: si el proceso node sale, lo relanza.
rem Lo arranca la tarea S4U "CDP tango push" al bootear (sin login).
cd /d C:\Users\siste\Downloads\ds-cdp-dashboard
:loop
node scripts\tango-push.mjs >> tango-push.log 2>&1
timeout /t 15 /nobreak >nul
goto loop
