# Precios de productos

Solapa `/precios`: muestra el **precio vigente** de cada producto — **neto** y **con
impuestos**, en vista **general** (uno por producto) o **por sucursal**. Detrás del
mismo login (nav de admin y operaciones).

## De dónde salen los precios
Raven solo tiene **cantidades** (no precios) y las **listas de precios de Tango están
vacías** en `CENTRAL_ESTADISTICA`. Así que el precio vigente se toma del **precio
efectivo de la última venta** de cada producto en cada sucursal
(`CTA_DETALLE_COMANDA`): a cuánto se vendió realmente.

- **Precio vigente** por producto×sucursal = el precio unitario **más frecuente
  (moda) de los últimos 90 días**. Moda + ventana reciente + piso ($100) descartan
  outliers (ventas a $1, ajustes) y siguen la inflación.
- **Con impuestos** = `IMPORTE_CON_IMPUESTOS / CANTIDAD`. **Neto** = `IMPORTE_NETO / CANTIDAD`.
- **General** (uno por SKU) = precio de la sucursal más reciente + **rango min–max**
  entre sucursales.

## Activar Tango real
1. Crear la vista en Tango (una vez): correr `lib/sources/precios.queries.sql` en
   `CENTRAL_ESTADISTICA` (crea `dbo.vw_PreciosProducto` + `GRANT` a `cdp_lectura`).
2. La app la lee igual que las ventas: **SQL directo** en la red, o vía **bridge**
   (`TANGO_BRIDGE_URL`) en Vercel. El bridge ya expone `GET /precios`
   (reiniciar el bridge para que tome el endpoint nuevo).
3. Fuente: `PRECIOS_SOURCE=live` (o `DATA_SOURCE=live`). En Vercel, mismo esquema
   que ventas (bridge + Cloudflare Tunnel, ver `docs/tango-bridge.md`).

Sin eso, la pantalla usa **datos de ejemplo** (mock) y lo indica con un badge.

## Comparar contra el menú web (WooCommerce)
`npm run compare:precios` (con el dev en :3000 y precios live) scrapea el menú web
(`eldesembarco.com/menu`, `mrtasty.com.ar/menu-amba`), lo matchea por nombre contra
Tango y marca las diferencias (±% con semáforo ok / ~ / ‼). Valida si el **precio de
lista de la web** coincide con lo que se **cobra** (Tango).

Notas: web = precio de **lista**; Tango = precio **efectivo** (incluye promos/combos),
por eso los ‼ suelen ser mis-matches con SKUs de promo/combo. Un patrón "Tango ~+15%
vs web" = la web quedó **desactualizada** tras un aumento. Es herramienta de validación
(el scraping depende del HTML del sitio), no un dato productivo.

## Estructura
- `lib/sources/precios.queries.sql` — vista `vw_PreciosProducto`.
- `lib/sources/tango.ts` — `tangoPreciosSource` (SQL directo + bridge).
- `lib/sources/mock.ts` — `mockPreciosSource`.
- `lib/sources/index.ts` — `getPreciosSource()` (pisable con `PRECIOS_SOURCE`).
- `lib/precios.ts` — arma general (agrega sucursales) + por sucursal.
- `app/api/precios/route.ts` — `GET /api/precios[?sucursal=]`.
- `components/views/PreciosView.tsx` + `app/precios/page.tsx` — pantalla.
- `scripts/tango-bridge.mjs` — endpoint `GET /precios`.
