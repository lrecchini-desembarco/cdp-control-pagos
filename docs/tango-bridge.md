# Bridge Tango → Vercel (Cloudflare Tunnel)

Vercel corre en la nube y **no llega al SQL Server interno** (`SRVTANGO\AXSQLEXPRESS`,
red 192.168.x). Para que la app deployada lea ventas reales, corremos un **bridge
HTTP** en una máquina de la red de la empresa y lo publicamos con **Cloudflare Tunnel**.
Vercel le pega a esa URL (no al SQL directo → más seguro: solo expone ventas, con secreto).

```
Vercel (app)  ──HTTPS──>  Cloudflare Tunnel  ──>  bridge (red interna)  ──>  SQL Tango
                                                   GET /ventas (con secreto)   vw_VentasInsumoDiaria
```

## 1. En una máquina de la red interna (la que llega a SRVTANGO)

Requisitos: Node 18+, el repo clonado, `npm install` hecho.

`.env.local` con las credenciales de Tango + un secreto largo:
```
TANGO_DB_HOST=SRVTANGO
TANGO_DB_INSTANCE=AXSQLEXPRESS      # o TANGO_DB_PORT=1433 si la instancia escucha ahí
TANGO_DB_NAME=CENTRAL_ESTADISTICA
TANGO_DB_USER=cdp_lectura
TANGO_DB_PASSWORD=********
TANGO_DB_TRUST_CERT=true
BRIDGE_SECRET=un-token-largo-y-secreto      # generá uno random
```

Levantar el bridge:
```bash
npm run bridge        # escucha en http://localhost:8787
```
Probar local: `curl -H "x-bridge-secret: <token>" "http://localhost:8787/ventas?desde=2026-06-01&hasta=2026-06-30"`

## 2. Publicar con Cloudflare Tunnel (gratis)

Instalar `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

**Rápido (URL temporal, para probar):**
```bash
cloudflared tunnel --url http://localhost:8787
```
Da una URL tipo `https://algo-al-azar.trycloudflare.com` (cambia cada vez que reinicia).

**Estable (recomendado para producción):** tunnel con nombre + dominio propio:
```bash
cloudflared tunnel login
cloudflared tunnel create cdp-tango
# Asociar un hostname (ej. tango.tudominio.com) y apuntarlo a http://localhost:8787
cloudflared tunnel route dns cdp-tango tango.tudominio.com
cloudflared tunnel run cdp-tango
```
Para que quede prendido siempre: instalarlo como servicio (`cloudflared service install`).

> El bridge y el túnel tienen que quedar **corriendo 24/7** en esa máquina (o un
> servidorcito de la red). Si se apagan, la app en Vercel deja de ver ventas.

### Dejarlo 24/7 (sin consola abierta)

**Bridge como tarea de Windows.** Dos opciones:

- **Con admin (recomendado para un servidor):** arranca al prender la máquina
  (antes del login), corre como SYSTEM y se reinicia solo.
  ```powershell
  # PowerShell COMO ADMINISTRADOR, en la carpeta del repo:
  powershell -ExecutionPolicy Bypass -File scripts\instalar-bridge-servicio.ps1
  ```
  Desinstalar: `Unregister-ScheduledTask -TaskName "CDP Tango Bridge" -Confirm:$false`

- **Sin admin:** arranca al iniciar sesión tu usuario, oculto (sirve si la
  máquina queda logueada).
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\instalar-bridge-usuario.ps1
  ```
  Desinstalar: `Unregister-ScheduledTask -TaskName "CDP Tango Bridge (usuario)" -Confirm:$false`

**Cloudflare Tunnel como servicio** (requiere tunnel con nombre, paso de arriba):
```powershell
cloudflared service install   # lo deja como servicio de Windows, arranca solo
```
(La opción rápida `--url ...trycloudflare.com` NO es para 24/7: es temporal y la
URL cambia. Para producción usá el tunnel con nombre + dominio.)

## 3. En Vercel (Project → Settings → Environment Variables)

```
VENTAS_SOURCE=live
TANGO_BRIDGE_URL=https://tango.tudominio.com     # la URL del túnel
TANGO_BRIDGE_SECRET=<el mismo BRIDGE_SECRET>
```
Dejar `DATA_SOURCE=mock` (pedidos/catálogo siguen mock hasta tener Raven token / vista catálogo).
**Redeploy** para que tome las variables.

## Endpoint `/cobros` (cobros por forma de pago — para contrastar Mercado Pago)

`GET /cobros?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (header `x-bridge-secret`). Ya está en el
bridge (mismo patrón que `/ventas`), pero **depende de una vista que crea Sistemas**:
`dbo.vw_CobrosDiarios`. Hasta que exista, `/cobros` responde **502** (`Invalid object name`)
— queda "plug-and-play": apenas la vista exista, devuelve datos sin tocar código.

Contrato que debe exponer la vista (para el consumidor de la app de cierres):

```sql
CREATE VIEW dbo.vw_CobrosDiarios AS
SELECT
  <fecha_comercial>  AS FECHA,          -- DATE
  <id_sucursal>      AS ID_SUCURSAL,    -- ID de Tango (clave firme, mapear por ID)
  <desc_sucursal>    AS DESC_SUCURSAL,  -- nombre de sucursal (etiqueta / fallback)
  <medio_pago_desc>  AS MEDIO_PAGO,     -- Efectivo, Visa, Mastercard, Mercado Pago/QR, PedidosYa…
  SUM(<importe>)     AS IMPORTE
FROM   <tablas CTA_* de cobros> JOIN SUCURSAL ...
WHERE  <estado válido>                   -- equivalente al ESTADO='P' de ventas (excluir anulados)
GROUP  BY <fecha_comercial>, <id_sucursal>, <desc_sucursal>, <medio_pago_desc>;

GRANT SELECT ON dbo.vw_CobrosDiarios TO cdp_lectura;
```

> El endpoint `/cobros` del bridge lee **exactamente** esas columnas (`FECHA`, `ID_SUCURSAL`,
> `DESC_SUCURSAL`, `MEDIO_PAGO`, `IMPORTE`). Incluir `ID_SUCURSAL` Y `DESC_SUCURSAL`: la app cruza
> MP por ID (Tango usa otro namespace de IDs que Raven/CDP), el nombre es etiqueta. Ideal: **una
> fila por cobro** (con hora + N° comprobante) para contraste operación-por-operación; si no, total diario.

## Endpoint `/recetas` (receta de menú — para el Cruce)

`GET /recetas` (header `x-bridge-secret`). Ya está en el bridge, pero **depende de una vista
que crea Sistemas**: `dbo.vw_RecetasVenta`. Hasta que exista responde **502**. Da la receta
de menú: qué **insumo** (y cuánto) consume cada **artículo de venta**, para traducir ventas → insumo.

```sql
CREATE VIEW dbo.vw_RecetasVenta AS
SELECT
  <cod_articulo_venta>  AS sku_venta,     -- COD_ARTICULO del artículo que se VENDE (mismo que en ventas)
  <desc_articulo_venta> AS nombre_venta,  -- nombre del producto de venta (etiqueta)
  <cod_insumo>          AS codigo_insumo, -- COD_ARTICULO del INSUMO que consume (ej. 083009 Tuki 80g)
  <desc_insumo>         AS nombre_insumo, -- nombre del insumo (etiqueta)
  <cantidad>            AS cantidad       -- unidades de insumo por 1 unidad vendida (el "factor")
FROM   <tablas de receta / composición de artículos de Tango Restô>
WHERE  <receta activa>;

GRANT SELECT ON dbo.vw_RecetasVenta TO cdp_lectura;
```

> Es la **receta de descuento de stock** de Tango Restô (composición del artículo de venta),
> pero que **corte en el insumo comprable** (ej. medallón), no que baje a materias primas.
> `sku_venta` debe ser el mismo código que aparece en `vw_VentasInsumoDiaria.sku`, y `codigo_insumo`
> el mismo que pide Raven (050027 Bolas, 083009 Tuki 80g, 083041 Tuki 55g…).

## Notas
- Endpoints: `GET /` (índice, sin secreto) · `GET /health` · `GET /ventas?desde&hasta` ·
  `GET /precios` · `GET /sucursales` (maestro por nombre, DESC_SUCURSAL) · `GET /cobros?desde&hasta`.
  Todos (salvo `/` y `/health`) exigen el header `x-bridge-secret`. Consultas parametrizadas a
  vistas, sin SQL arbitrario. **Es un solo proceso**: todos los endpoints salen del mismo bridge/túnel.
- El endpoint `/cobros` recién agregado se sirve tras **reiniciar el bridge** (reboot o manual);
  como igual da 502 hasta que exista `vw_CobrosDiarios`, no urge reiniciar.
- En la red interna, el dev local usa **SQL directo** (sin bridge): no setees
  `TANGO_BRIDGE_URL` en esa `.env.local`.
- Mismo patrón sirve a futuro para Catálogo: se agrega un `GET /catalogo` al bridge.
