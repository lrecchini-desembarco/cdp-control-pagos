# CDP · Control — DS Group

Dashboard interno para comparar lo que cada sucursal **pide al CDP** (vía el endpoint de Raven)
contra lo que efectivamente **vende**, traducido a insumo. Next.js (App Router) + TypeScript + Tailwind.
Sin autenticación: pensado para la etapa de desarrollo.

## Correr

```bash
npm install
cp .env.example .env.local   # producción: DATA_SOURCE=live (Raven + Tango)
npm run dev                  # http://localhost:3000
```

Para iterar sin red (sin Tango/token), poné `DATA_SOURCE=mock` en `.env.local`.

## Acceso y roles

Login por **email + clave genérica** (`APP_PASSWORD`, default `cdp2026`). El admin da
de alta emails y su rol en **`/usuarios`**; el rol define qué pantallas ve cada uno:

- **Administrador** — todo + gestión de usuarios.
- **Operaciones** — todo el control (cruce, alertas, catálogo, mapeos, Raven, reseñas).
- **Local** — solo Reseñas.

El menú se filtra por rol y las rutas no permitidas redirigen. La sesión es una cookie;
el rol se deriva del store (no se puede escalar tocando la cookie).

## Pantallas

- **¿Qué puedo hacer?** (`/guia`) — guía de orientación: qué se puede hacer desde la app y cómo, paso a paso, con accesos directos.
- **Reseñas** (`/resenas`) — elegí un local, calificá el QA (1–5 por criterio) e imprimí la planilla de visita.
- **Usuarios** (`/usuarios`, solo admin) — alta/baja de emails y su rol.
- **Firmas** (`/firmas`) — generador de firmas de empleados embebido (proyecto aparte en GitHub Pages),
  unificado acá. URL configurable con `NEXT_PUBLIC_FIRMAS_URL`.
- **Resumen** (`/`) — estado del último día: pedido al CDP, venta equivalente, desvío neto y líneas a revisar.
  Arriba, una banda con el estado de las alertas.
- **Alertas** (`/alertas`) — centro de monitoreo: detecta quiebres, sobre-pedidos, desvíos recurrentes y
  puntos ciegos (sucursales sin mapear, insumos sin receta), ordenados por urgencia y con acción directa.
  Ver [`docs/alertas.md`](docs/alertas.md).
- **Cruce CDP vs ventas** (`/cruce`) — la pantalla central. Filtros por fecha, marca y búsqueda;
  tabla con la **barra de desvío divergente** (izquierda = sub-pedido, derecha = sobre-pedido) y
  semáforo por tolerancia (≤5% / 5–15% / >15%).
- **Consultar Raven** (`/raven`) — consulta en vivo por código + fecha de entrega. Desglose por sucursal.
- **Mapeos** (`/mapeos`) — sucursales (Raven → código canónico) y productos (insumo CDP → SKU → factor/BOM).
- **Control de catálogo** (`/catalogo`) — audita el maestro de Tango (precio $0, cross-brand, sin marca,
  candidatos a baja), prioriza y exporta la lista "a corregir". Ver [`docs/catalogo.md`](docs/catalogo.md).
- **Notificaciones** — resumen de alertas + catálogo crítico por Slack/cron. Botón "Enviar resumen ahora"
  en `/alertas` y endpoint `/api/notify`. Ver [`docs/notificaciones.md`](docs/notificaciones.md).

## Datos

El cruce combina **dos fuentes reales** (ver [`docs/datos.md`](docs/datos.md)):

- **Pedidos al CDP → Raven** (`lib/sources/raven.ts`): pega a `/api/raven` /
  `https://api.ravenfood.app/data/items/:code?date=` por insumo y fecha, y traduce
  `branch_code → código canónico`.
- **Ventas por SKU → Tango / SQL Server** (`lib/sources/tango.ts`): lee la vista
  read-only `dbo.vw_VentasInsumoDiaria` (template en `lib/sources/tango.queries.sql`).

El motor `construirCruce()` (`lib/cruce.ts`) las combina en `CruceRow[]`, expuesto por
`/api/cruce`; las alertas se calculan en `/api/alertas`. La selección de fuente es la
variable `DATA_SOURCE` (`live` por defecto, `mock` para desarrollo).

**Para quedar 100% productivo falta** (infra del cliente): `RAVEN_TOKEN`, la vista de
Tango creada + usuario solo-lectura, y las credenciales `TANGO_*`. Detalle en `docs/datos.md`.

**Conectar datos reales (paso a paso):** ver **[`docs/conectar-tango.md`](docs/conectar-tango.md)**.
SQL listo para Sistemas en [`docs/sql/tango-setup.sql`](docs/sql/tango-setup.sql); validá la
conexión con `npm run test:tango` antes de poner `DATA_SOURCE=live`.

## Heurísticas de Nielsen aplicadas

1. Visibilidad del estado — indicador de conexión a Raven en la barra superior, skeletons de carga.
2. Lenguaje del negocio — sucursal, insumo, desvío, pedido (no "rows"/"records").
3. Control y libertad — filtros reseteables, edición reversible en Mapeos, breadcrumb.
4. Consistencia — mismos componentes y patrones en todas las pantallas.
5. Prevención de errores — validación de código y fecha antes de pegar a Raven.
6. Reconocer > recordar — filtros visibles, leyenda de color del semáforo.
9. Recuperación de errores — mensajes claros con acción de reintento.

## Estructura

```
app/              páginas + route handlers (/api/raven · /api/cruce · /api/alertas · /api/catalogo · /api/notify)
components/ui     primitivos (Card, Badge, Button, EmptyState, ErrorState…)
components/views  AlertasView · CruceView · RavenExplorer · MapeosView · CatalogoView · DetalleModal
components/layout Sidebar · Topbar
lib/              types · brands (format) · catalogo (config) · cruce (motor) · alertas · catalogo-control
lib/sources/      adapters: raven (pedidos) · tango (ventas) · catalogo-tango (maestro) · mock · index
docs/             documentación funcional (datos.md · alertas.md · catalogo.md)
```

## Próximo paso

Conectar la infraestructura real (ver `docs/datos.md`): `RAVEN_TOKEN`, la vista
`vw_VentasInsumoDiaria` en Tango y las credenciales `TANGO_*`. El código ya está
cableado: es completar `.env.local` con `DATA_SOURCE=live`.
