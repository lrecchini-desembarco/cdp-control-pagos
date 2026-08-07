# Consumo (CMV) vs Ventas — tablero de rentabilidad por insumo

Fecha: 2026-08-07 · Pantalla: `/compras` (evoluciona la actual "Compras vs Ventas").

## Objetivo
Convertir `/compras` en la herramienta estrella del CDP: un tablero con **datos reales
y actuales** que cruce el **consumo de insumos valorizado (CMV)** contra las **ventas**,
permita **comparar meses**, muestre **rentabilidad** y **qué se consume más/menos**, con
gráficos y filtros por local y marca — sin cargar CSV a mano.

## Fuente de datos (real, verificada 2026-08-07)
Base **Neon Postgres** del grupo (la misma de Cierres/bi-ventas), esquema `cierres`:
- `consumo_insumo_tango` — 361k filas, por **insumo × local × día**, con `cantidad`,
  `costo_unitario`, `costo_total`. Es el **CMV real**. Cubre **jun-2026 →** (actual a hoy).
- `venta_tango_articulo` — ventas por **artículo × local × día**, con `monto` (=$) y `cantidad`.
- `sucursal_tango` — catálogo `id → nombre, marca ('D'|'T'), es_propia, local_id`.

Números de control (jun/jul 2026): margen bruto grupo 63,4 % / 65,4 %; CMV ~$2.000 M/mes;
ventas ~$5.500 M/mes. Insumo top: Medallón Carne (~$400 M/mes).

**Límite conocido:** la base arranca **jun-2026**, no hay 2025 → el YoY se deja preparado
en la UI pero deshabilitado hasta que exista histórico. Comparación **mes a mes** desde ya.

## Arquitectura
- **Conexión nueva** de `cdp-control-pagos` a Neon vía `pg` (env `DATABASE_URL`, sslmode=require).
  Pool singleton read-only en `lib/consumo-db.ts` (patrón igual a `getPool` de mssql).
- **Capa de datos** `lib/consumo.ts`: queries agregadas en SQL (rápidas), tipadas:
  - `getResumenMensual(filtros)` → por mes: ventas $, unidades, CMV $, margen %.
  - `getComparativo(mesA, mesB, filtros)` → por insumo: cantidad/costo en A y B + variación %.
  - `getSucursales()` → catálogo para el filtro (nombre, marca, es_propia).
  - Filtros comunes: `{ marca?: 'D'|'T', propias?: boolean, sucursalId?: number }`.
- **API** `app/api/consumo/route.ts` (GET, `guard('/compras')`): despacha por `?q=resumen|comparativo|sucursales`
  con `desde/hasta/mesA/mesB/marca/propias/sucursal`. Devuelve JSON `{ ok, ... }`.
  `export const dynamic = "force-dynamic"`.
- **Vista** `components/views/ComprasView.tsx` reescrita con pestañas:
  1. **Rentabilidad (mes a mes)** — default. KPIs (Ventas, CMV, Margen %, Unidades) del período,
     selector **Mes A vs Mes B**, gráfico de barras comparativo (SVG propio, sin lib externa),
     y línea/serie de margen por mes.
  2. **Más / menos consumido** — ranking por costo del período + tabla de **mayores variaciones**
     (A→B, ordenable), para detectar desvíos (ej. "Caja Milanesa +137 %").
  3. **Por insumo (drill)** — buscador + detalle por insumo: cantidad, costo, % del CMV, por local.
  4. **Compras (CSV)** — la carga manual actual, intacta, como pestaña secundaria (facturas reales
     vs consumo teórico). Se conserva `lib/remitos`/parser y el cruce vs ventas por local.
  - **Filtros globales** (todas las pestañas): marca (Todos/Desembarco/Mr Tasty), propios/franquicias, local.
  - Export **CSV** por pestaña (reusa `lib/exportar-csv`).

## Export de informe a PDF (fase posterior al core+QA)
- Página imprimible `/compras/informe` (o modo print de la vista) con `@media print` + branding DS,
  que arma el informe del período elegido (KPIs, margen mes a mes, top insumos, variaciones) y se
  guarda como PDF con el diálogo del navegador ("Guardar como PDF"). Sin dependencia nueva.
- Botón **"⬇ Informe PDF"** en la vista abre esa página con los filtros aplicados por querystring.
- (Alternativa evaluada: html-to-image + jsPDF — descartada por no sumar deps salvo que se pida
  envío automático por mail, que se puede enganchar luego a `nodemailer` ya presente.)

## Roles / permisos
`/compras` ya existe en el nav (admin + operaciones). Sin cambios de rol. La API guarda con `guard('/compras')`.

## Testing / QA
1. `lib/consumo.ts`: batería Node que valida los agregados contra números de control conocidos
   (margen jun 63,4 %, CMV jul ~$2.002 M) — evita regresiones de fórmula.
2. Skill `qa` del proyecto (rutas, `tsc`, `build`) + smoke en dev limpio.
3. **Revisión con "experto en ventas"** (subagente): valida definiciones de negocio — CMV vs ventas
   mismo período y misma cobertura de locales, tratamiento de insumos sin costo, promos sin costo,
   margen bruto vs neto (regalías/publicidad), y que "más/menos consumido" no confunda volumen con $.

## Fuera de alcance (v1)
- YoY 2026 vs 2025 (sin datos 2025; UI preparada).
- Backfill de histórico Tango (posible fase 2 si hay histórico real).
- Envío automático del PDF por mail (engancha a nodemailer en fase posterior si se pide).
- Reconciliación unidad-a-unidad compras-factura ↔ consumo (requiere match proveedor→insumo).

## Env / deploy
- `DATABASE_URL` (sensitive) a agregar en Vercel (production + preview). Local ya en `.env.local`.
- Neon es alcanzable desde Vercel (bi-ventas ya lo usa). Deploy automático por push a `main`.
