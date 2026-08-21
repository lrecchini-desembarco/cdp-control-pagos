---
name: qa
description: >
  QA del dashboard CDP después de un cambio de código: verifica rutas/navegación,
  tipos y build, y hace un smoke test en un dev limpio para descartar el "404 This
  page could not be found". Usar tras editar páginas, navegación, roles, fuentes de
  datos o APIs, o cuando aparezca un 404 en pantallas que deberían existir.
---

# QA post-cambio — dashboard CDP

Objetivo: que después de tocar código **no queden rutas rotas (404), errores de tipo
ni build roto**. El 404 típico ("This page could not be found") casi siempre es el
`.next` contaminado, no un bug — ver `docs/qa.md`.

## Pasos (en orden)

1. **Rutas / navegación**
   ```bash
   npm run qa
   ```
   Detecta rutas del menú (`Sidebar`) o de `lib/roles.ts` sin su `app/<ruta>/page.tsx`,
   y las inconsistencias Sidebar ↔ roles ↔ `app/`. Debe dar "✓ QA de rutas OK".

2. **Tipos**
   ```bash
   npx tsc --noEmit
   ```

3. **Build** (compila las 18 páginas; falla si una ruta rompe)
   ```bash
   npm run build
   ```

4. **Smoke test en dev LIMPIO** (evita el 404 por `.next` viejo). Importante:
   `next build` deja un `.next` de producción → hay que borrarlo antes del `dev`.
   - Parar todos los dev viejos (Windows, por puerto):
     ```powershell
     3000..3010 | %{ try{(Get-NetTCPConnection -LocalPort $_ -State Listen).OwningProcess}catch{} } | select -Unique | %{ Stop-Process -Id $_ -Force -EA SilentlyContinue }
     ```
   - `rm -rf .next && npm run dev` (uno solo).
   - Login y entrar a las pantallas tocadas; confirmar **200** (no 404/500).
     Para chequear varias rutas rápido: login vía `POST /api/auth/login`
     (un email de admin + la clave de `APP_PASSWORD`) y `curl` con la cookie a cada ruta.

## Si aparece un 404 en una ruta que existe
Es el `.next`/dev, no el código:
- `rm -rf .next`, matar dev duplicados, `npm run dev` de nuevo.
- En Vercel: si una ruta da 404, el deploy quedó en un commit viejo → redeploy del último `main`.

## Al agregar una pantalla nueva (checklist)
`app/<ruta>/page.tsx` + entrada en `Sidebar.tsx` (`NAV`) + la ruta en `lib/roles.ts`
(`nav`) → después `npm run qa`, `tsc`, `build`, smoke test. Detalle en `docs/qa.md`.
