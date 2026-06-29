# Conectar datos reales (Tango) — runbook

Pasos para pasar de **mock** a **datos reales** de Tango. "Ventas por turno" y
"Control de catálogo" dependen de esto. (Los **pedidos** del Cruce vienen de Raven,
es aparte — ver más abajo.)

El código ya está listo: hay un switch `DATA_SOURCE` y adapters reales. Esto es
**configuración + accesos**, no programación.

---

## Resumen (qué necesitás)
1. Crear 2 vistas read-only en Tango + un usuario solo-lectura.
2. Que la app pueda **conectarse** al SQL Server de Tango.
3. Completar las variables `TANGO_DB_*` y poner `DATA_SOURCE=live`.
4. Probar con `npm run test:tango` y listo.

---

## Paso 1 — Sistemas: crear vistas + usuario (en Tango)
Entregá a Sistemas/DBA el archivo **[`docs/sql/tango-setup.sql`](sql/tango-setup.sql)**.
Tienen que:
- Reemplazar los nombres marcados con `-- <<` por los reales del esquema Tango
  (tabla de comprobantes, renglones, equivalencia de bocas, flags, etc.).
- Ejecutarlo. Crea:
  - `dbo.vw_VentasInsumoDiaria` → ventas por `fecha · sucursal_canonico · sku · turno · unidades`.
  - `dbo.vw_ArticulosCatalogo` → maestro de artículos (para Control de catálogo).
  - usuario `lectura_cdp` (solo `SELECT` sobre las vistas).

> **Clave de "Ventas por turno":** el `turno` se calcula con la **HORA** del
> comprobante. La fecha del comprobante debe ser **datetime (con hora)**. Si solo
> hay fecha sin hora, no se puede separar por turno.

## Paso 2 — Reachability (¿dónde corre la app?)
El SQL Server de Tango está en una **IP interna** (`192.168.0.10`). La app tiene que
poder llegar a esa IP. Opciones:
- **On-prem**: correr la app en una máquina/servidor dentro de la red de los locales/depósito. (Lo más simple.)
- **VPN / túnel**: el server (cloud) entra a la red por VPN o un túnel al SQL Server.
- **Sync a la nube**: un proceso copia Tango → una base en la nube y la app lee esa.

> Por esto, **Vercel directo no llega** a una IP interna. Si va a Vercel, hay que
> resolver el puente (VPN/túnel o sync). Para arrancar, on-prem es lo más rápido.

## Paso 3 — Variables de entorno
En `.env.local` (o en las env del server donde corre):
```
DATA_SOURCE=live
TANGO_DB_HOST=192.168.0.10
TANGO_DB_PORT=1433
TANGO_DB_NAME=TANGO_GESTION
TANGO_DB_USER=lectura_cdp
TANGO_DB_PASSWORD=la-que-definió-sistemas
TANGO_DB_ENCRYPT=false
TANGO_DB_TRUST_CERT=true
```

## Paso 4 — Probar la conexión (antes de prender la app)
```
npm install
npm run test:tango
```
Tiene que mostrar filas de `vw_VentasInsumoDiaria` y el desglose por turno. Si falla,
el mensaje indica qué revisar (red, credenciales, encrypt/trust, o la vista).

## Paso 5 — Encender
Con `DATA_SOURCE=live`, `npm run dev` (o build) y la pantalla **Ventas por turno**
muestra datos reales. Mientras `DATA_SOURCE` no sea `live`, sigue en mock.

## Opcional — nombres y marcas lindos
La app traduce `sku` → nombre/marca con las **reglas de producto** de la pantalla
**Mapeos**. Si están cargadas, ves "Burger clásica" en vez del código. Si no, igual
funciona (muestra el SKU crudo).

---

## Aparte: pedidos reales (Raven) — para el Cruce
"Ventas por turno" NO usa Raven. Pero el **Cruce** sí necesita pedidos reales:
- Setear `RAVEN_TOKEN` (el endpoint público solo expone algunos códigos).
- Confirmar los códigos de insumo a monitorear.
Con eso, el Cruce contrasta pedido real (Raven) vs venta real (Tango).
