# Roles editables + orden del menú

## Qué ve cada rol (editable desde /usuarios)
Antes el `nav` de cada rol era fijo en `lib/roles.ts`. Ahora es **editable y
persistido**: en **/usuarios** (solo admin) hay una sección **"Qué ve cada rol en el
menú"** con un chip por pantalla; tildar/destildar guarda al instante.

- Config guardada en el store (`roles_nav`, KV en prod / `.data` en local).
- Si el store está vacío → usa los **defaults** de `ROLES` (comportamiento previo).
- **Anti-autobloqueo:** `/guia` siempre visible para todos, y `/usuarios` siempre
  para admin (no se pueden desmarcar).
- El **gating** (layout server-side) y el **menú** leen esta config: si un rol no
  tiene una ruta, no la ve y si la pide lo manda a su home.

Flujo: `lib/roles.ts` (catálogo `NAV_CATALOG` + helpers `puedeVerNav`/`homeDeNav`) →
`lib/roles-store.ts` (get/set persistido) → `app/api/roles` (GET/POST admin) →
`app/layout.tsx` (gatea + pasa los items al Sidebar) → `UsuariosView` (editor).

## Orden del menú (drag + localStorage)
En el **Sidebar** se puede **arrastrar** cada item para reordenarlo. El orden se
guarda en **localStorage** (`cdp_nav_orden`), por navegador/usuario — no afecta a
los demás. Botón **"↺ orden"** (abajo) vuelve al orden original.

- Es solo visual/personal (no cambia permisos).
- Items nuevos (o recién habilitados por el admin) aparecen al final del orden guardado.
