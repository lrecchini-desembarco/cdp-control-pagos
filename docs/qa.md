# QA — testear después de un cambio (y por qué aparece el 404)

## El "404 This page could not be found"
Casi siempre **no es un bug de código**, es el `.next` (build de Next) en un estado
inconsistente. Pasa cuando:

1. Se corre **`npm run build`** (build de producción) y después **`npm run dev`** sobre
   el **mismo `.next`** → el dev sirve 404 en rutas que sí existen.
2. Se **cambia de branch** con el `dev` corriendo → HMR queda desincronizado.
3. Quedan **varios dev servers** viejos escuchando distintos puertos (uno con `.next`
   viejo responde el 404).

### Cómo arreglarlo (siempre igual)
```bash
# parar TODO dev y limpiar el build:
# (Windows) matar node en los puertos 3000-3010, después:
rm -rf .next
npm run dev        # arranca limpio, en su propio .next
```
En Windows, para matar los dev viejos por puerto (PowerShell):
```powershell
3000..3010 | %{ try{(Get-NetTCPConnection -LocalPort $_ -State Listen).OwningProcess}catch{} } |
  select -Unique | %{ Stop-Process -Id $_ -Force -EA SilentlyContinue }
```

### Variante en build (`PageNotFoundError` / `Cannot find module './xxx.js'`)
Si `npm run build` falla con "Failed to collect page data" o "Cannot find module" en
una ruta que no tocaste, es el mismo `.next` corrupto. Rebuild 100% limpio:
```bash
rm -rf .next node_modules/.cache && npm run build
```

### Reglas para que NO vuelva a pasar
- **Nunca** dejar un `next build` y después `next dev` sin borrar `.next` en el medio.
- Tener **un solo** dev server corriendo.
- Después de `git checkout`/merge con dev abierto → reiniciar el dev (limpio).
- El deploy en Vercel **no** sufre esto (buildea limpio cada vez). Si en Vercel una
  ruta da 404, es que el deploy quedó en un **commit viejo** → redeploy del último `main`.

## QA después de un cambio (obligatorio antes de commitear/PR)
```bash
npm run qa            # rutas: que el menú (Sidebar) y roles tengan su page.tsx
npx tsc --noEmit      # tipos
npm run build         # compila (18/18 páginas) — falla si una ruta rompe
```
- `npm run qa` (`scripts/qa.mjs`) detecta la causa #1 de 404 propio: una ruta en el
  **menú o en roles sin su `page.tsx`**, y las inconsistencias Sidebar ↔ roles ↔ `app/`.
- Si tocaste algo que se ve en el navegador, además hacé un **smoke test** con el dev
  limpio (login + entrar a las pantallas tocadas).

## Checklist al agregar una pantalla nueva
1. `app/<ruta>/page.tsx` (render del componente de `components/views/`).
2. Entrada en `components/layout/Sidebar.tsx` (`NAV`).
3. La ruta en `lib/roles.ts` (`nav` de los roles que la ven).
4. `npm run qa` → todo ✓ · `npx tsc --noEmit` · `npm run build`.
5. Smoke test en dev limpio.
