---
name: dev-limpio
description: >
  Reinicia el entorno de desarrollo de Next LIMPIO cuando aparecen errores típicos
  de dev que NO son del código: ChunkLoadError ("Loading chunk … failed"), "Cannot
  find the middleware module", o 404/500 en pantallas que existen. Casi siempre son
  el .next corrupto + varios dev servers corriendo a la vez. Usar apenas aparezca
  alguno de esos errores en localhost.
---

# Dev limpio — arreglar ChunkLoadError / .next corrupto

Estos errores en `localhost` **no son bugs del código**: pasan cuando queda el
`.next` (build de Next) desincronizado o hay **varios `npm run dev`** corriendo en
distintos puertos (uno sirve chunks viejos). El fix es siempre el mismo.

## Fix (un comando)
```bash
npm run dev:limpio
```
Hace: mata los dev de los puertos 3000-3010 → borra `.next` (+ cache) → arranca **un**
dev limpio. Después, **en el navegador: Ctrl+Shift+R** (hard refresh) para soltar el
chunk viejo cacheado.

Equivalente manual (si el script no está a mano), PowerShell:
```powershell
3000..3010 | %{ try{(Get-NetTCPConnection -LocalPort $_ -State Listen).OwningProcess}catch{} } | select -Unique | %{ Stop-Process -Id $_ -Force -EA SilentlyContinue }
Remove-Item -Recurse -Force .next; npm run dev
```

## Cuándo usarla
- **ChunkLoadError: Loading chunk app/…/page failed**
- **Error: Cannot find the middleware module**
- **404 / 500** en una ruta que sí existe (verificable con `npm run qa`)
- Notás **más de un dev server** (distintos puertos) respondiendo

## Reglas para que no vuelva a pasar
- **Un solo `npm run dev`** a la vez.
- Nunca abrir el dashboard mientras corre `npm run build` (build y dev comparten `.next`).
- Después de `git checkout`/merge con el dev abierto → `npm run dev:limpio`.
- **En Vercel (prod) esto NO pasa:** cada deploy es un build limpio e inmutable.

Detalle y contexto en `docs/qa.md`.
