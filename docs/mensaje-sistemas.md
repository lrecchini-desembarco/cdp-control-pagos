# Mensaje para Sistemas (reenviar)

> Asunto: Acceso read-only a Tango para dashboard interno (2 vistas + 1 usuario)

Hola 👋 Estamos montando un dashboard interno que **lee** datos de Tango (ventas y
catálogo) en **solo-lectura**. No toca las tablas internas: consume **2 vistas** que
les pedimos crear. Va el detalle:

**1) Ejecutar el script** `docs/sql/tango-setup.sql` (adjunto / en el repo
`lrecchini-desembarco/cdp-control`). Crea:
- `dbo.vw_VentasInsumoDiaria` → ventas por **fecha · sucursal · sku · turno · unidades**.
- `dbo.vw_ArticulosCatalogo` → maestro de artículos (precios/marca/estado).
- usuario **`lectura_cdp`** con solo `SELECT` sobre esas 2 vistas.

**2) Mapear** (en el script están marcados con `-- <<`) los nombres reales de:
- tabla de **comprobantes de venta** (cabecera) y de **renglones** (detalle por artículo),
- la **equivalencia de boca → código canónico** de sucursal,
- el flag de **anulado** y los **tipos** que cuentan como venta,
- (para catálogo) equivalencias **rubro → marca** y **lista → marca**.

**3) ⚠️ Importante (turnos):** el turno (mediodía/tarde/noche) se calcula con la
**hora** del comprobante. La fecha del comprobante tiene que ser **datetime (con
hora)**. Si solo guardan fecha sin hora, avísennos.

**4) Devolvernos:**
- `host` / `puerto` / `nombre de base` del SQL Server,
- la **clave** que le pongan a `lectura_cdp`,
- confirmar que el dashboard va a poder **conectarse** a ese SQL Server (si corre
  fuera de la red, habría que habilitar VPN/acceso).

Con eso lo dejamos andando. Cualquier duda del script, lo vemos. ¡Gracias!
