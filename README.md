# CDP · Control — DS Group

Dashboard interno para comparar lo que cada sucursal **pide al CDP** (vía el endpoint de Raven)
contra lo que efectivamente **vende**, traducido a insumo. Next.js (App Router) + TypeScript + Tailwind.
Sin autenticación: pensado para la etapa de desarrollo.

## Correr

```bash
npm install
npm run dev      # http://localhost:3000
```

## Pantallas

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

## Datos

- **Raven**: real. El componente pega a `/api/raven`, un route handler que proxea
  `https://api.ravenfood.app/data/items/:code?date=:fecha` (evita CORS y valida los parámetros).
- **Cruce y mapeos**: mock realista en `lib/mock.ts` (sucursales y productos reales).
  Acá es donde se enchufan después las planillas / el motor de cruce de Apps Script.

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
app/            páginas + route handler /api/raven
components/ui   primitivos (Card, Badge, Button, EmptyState, ErrorState…)
components/views  AlertasView · CruceView · RavenExplorer · MapeosView · DetalleModal
components/layout Sidebar · Topbar
lib/            tipos, marcas/format, mock, motor de alertas (alertas.ts)
docs/           documentación funcional (alertas.md)
```

## Próximo paso

Reemplazar `lib/mock.ts` por la lectura real (planilla `Raven_In` + `Producto_Map` del ecosistema
Apps Script, o un endpoint propio). La forma de los datos ya está definida en `lib/types.ts`.
