# Consumo (CMV) vs Ventas  ·  `/compras`

Tablero de **rentabilidad real** del grupo: cruza el **consumo de insumos valorizado (CMV)**
contra las **ventas**, mes a mes. Datos reales de Tango (no se carga nada a mano). Item del
panel: **"Consumo vs Ventas"** (sección *Ventas y compras*).

## Fuente de datos
Base Postgres del grupo (Neon, la misma de Cierres/bi-ventas), esquema `cierres`, vía
`DATABASE_URL`. Lee (agregado en SQL, ver `lib/consumo.ts` + `lib/consumo-db.ts`):
- `consumo_insumo_tango` — consumo por insumo×local×día con `costo_total` → **CMV real**.
- `venta_tango_articulo` — ventas por artículo×local×día (`monto` = $).
- `sucursal_tango` — catálogo id→nombre, marca (D/T), es_propia.

Disponible desde **jun-2026** (por eso el año-contra-año 2026 vs 2025 queda para cuando haya
histórico). El mes en curso es parcial: por defecto se comparan los dos últimos meses completos.

API: `app/api/consumo/route.ts` (`?q=resumen|comparativo|insumo|local|sucursales|meses`),
con filtros `marca` / `propias` / `sucursal`. Guardada con `guard('/compras')`.

## Pestañas
- **Rentabilidad** — KPIs del mes B (Ventas, CMV, Margen bruto, Unidades) con delta vs mes A,
  gráfico Ventas vs CMV por mes (SVG propio) y tabla mensual. Margen bruto = (Ventas − CMV)/Ventas.
- **Más / menos consumido** — comparativo por insumo entre mes A y B: más consumido, mayores
  subas y bajas (umbral relativo al período/filtro, no fijo).
- **Por insumo** — consumo del período por insumo, con % del CMV y buscador.
- **Por local (foodcost)** — ranking de locales por CMV/Ventas; detecta cobertura despareja
  (locales con ventas pero sin consumo cargado → margen no confiable).
- **Compras (CSV)** — carga manual de facturas/OC reales (la vieja pantalla, `ComprasCsvView`),
  cruce por local contra ventas. Complementa el consumo automático.

Cada pestaña exporta CSV. Botón **⬇ Informe PDF** arma un informe imprimible del período y
filtros actuales (`lib/informe-consumo.ts`, se guarda como PDF desde el navegador).

## IVA (resuelto 2026-08-07)
`venta_tango_articulo.monto` viene **con IVA (21%)**; el CMV es neto. Verificado contra
`vw_PreciosProducto` de Tango (donde `precio_neto = precio / 1,21`) y contra el precio de venta
implícito (que supera al precio neto → sólo posible si monto es bruto). Se netean las ventas ÷1,21
en `lib/consumo.ts` (constante `IVA`), así margen y foodcost son comparables al estándar. Los
umbrales de color (foodcost verde &lt;35 % / rojo &gt;40 %) ya operan sobre valores netos.

## Pendientes / próximos (del QA con experto en ventas)
- Consumo por **unidad vendida** (normalizado) para separar crecimiento de ventas de merma/precio.
- Umbral de foodcost **por marca** (Mr Tasty corre estructuralmente más alto que Desembarco).
- Foodcost **teórico vs real** usando recetas (BOM) → desvío = merma/robo. Requiere match receta→insumo.
- Alertas automáticas de desvío de margen/consumo por local.
