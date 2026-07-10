# Pedido a Sistemas / Reven — datos de Tango para el dashboard CDP

El dashboard **solo lee** Tango (nunca modifica), a través del usuario read-only
`cdp_lectura` sobre **vistas** en `CENTRAL_ESTADISTICA`. Hoy ya consume ventas
(unidades) y precios. Estos pedidos desbloquean, en orden de **impacto / esfuerzo**,
la **plata** y los **cobros** — que es lo que falta para pasar de "unidades" a
"facturación y caja reales".

Todo es aditivo (vistas nuevas o un permiso): **no toca nada existente**.

---

## 1) Rápido (1 línea) — habilitar cobros por medio de pago

La vista `dbo.vw_CobrosDiarios` **ya existe** (se usa para los cierres), pero
`cdp_lectura` todavía no tiene permiso de lectura. Con esto:

```sql
GRANT SELECT ON dbo.vw_CobrosDiarios TO cdp_lectura;
```

**Desbloquea:** cobros por día · sucursal · medio de pago (efectivo, tarjeta,
Mercado Pago/QR, PedidosYa…) → control de caja y **conciliación contra Mercado Pago**.

---

## 2) El grande — exponer el IMPORTE en las ventas

Hoy la vista de ventas trae solo **unidades**. El importe ya está en la tabla de
renglones (`CTA_DETALLE_COMANDA.IMPORTE_NETO`); esta **vista nueva** lo expone al
mismo grano que ya usamos (día · sucursal · SKU · turno), agregando `importe`. Es
idéntica a la vista de ventas actual + una columna:

```sql
USE [CENTRAL_ESTADISTICA];
GO
CREATE OR ALTER VIEW dbo.vw_VentasArticuloDiaria AS
SELECT
    CAST(d.FECHA_COMERCIAL AS date)  AS fecha,
    s.DESC_SUCURSAL                  AS sucursal_canonico,
    a.COD_ARTICULO                   AS sku,
    a.DESC_CTA_ARTICULO              AS nombre,
    t.turno                          AS turno,
    SUM(d.CANTIDAD)                  AS unidades,
    SUM(d.IMPORTE_NETO)              AS importe
FROM   dbo.CTA_DETALLE_COMANDA d
JOIN   dbo.CTA_ARTICULO a ON a.ID_CTA_ARTICULO = d.ID_CTA_ARTICULO
JOIN   dbo.SUCURSAL     s ON s.ID_SUCURSAL     = d.ID_SUCURSAL
CROSS APPLY (SELECT CASE
        WHEN DATEPART(HOUR, d.FECHA) >= 11 AND DATEPART(HOUR, d.FECHA) < 16 THEN 'mediodia'
        WHEN DATEPART(HOUR, d.FECHA) >= 16 AND DATEPART(HOUR, d.FECHA) < 20 THEN 'tarde'
        ELSE 'noche' END) AS t(turno)
WHERE  d.ESTADO = 'P'
GROUP BY CAST(d.FECHA_COMERCIAL AS date), s.DESC_SUCURSAL, a.COD_ARTICULO, a.DESC_CTA_ARTICULO, t.turno;
GO
GRANT SELECT ON dbo.vw_VentasArticuloDiaria TO cdp_lectura;
GO
```
(También en `docs/sql/tango-plata.sql`.)

**Desbloquea:** facturación **exacta** por producto/local/turno y **margen real**.
Hoy el dashboard la muestra *estimada* (precio efectivo × unidades); con esta vista
pasa a ser el importe real de cada comanda.

**Una confirmación** (para que el número cierre): ¿`IMPORTE_NETO` es el importe del
**renglón** (cantidad × precio) o unitario? ¿Es **sin IVA** (neto) o con IVA? Da igual
cuál, pero necesitamos saberlo para comparar consistente contra costos.

---

## 3) Para más adelante (opcional)

Si más adelante quieren, con el mismo patrón (vista + `GRANT ... TO cdp_lectura`):

- **`dbo.vw_VentasPorHora`** (`FECHA, ID_SUCURSAL, HORA, IMPORTE, TICKETS`) → ticket
  promedio y curvas por hora (dotación de personal, promos por franja).
- **`dbo.vw_RecetasVenta`** (`sku_venta, codigo_insumo, cantidad`) → la receta de
  descuento de stock de Restô, para el cruce pedido-vs-venta al 100% (si Tango tiene
  el BOM cargado).

El detalle de contrato de estas dos está en `docs/tango-bridge.md`.

---

## Cómo llega el dato al dashboard

El dashboard corre en la nube (Vercel) y **no llega al SQL interno**. Un proceso
read-only en una PC de la red (el "bridge", ya instalado) lee estas vistas y las
empuja. **No hay que abrir nada hacia afuera** ni exponer el SQL: el bridge sale hacia
afuera, no entra. Apenas la vista/permiso existe, el dato aparece solo — sin tocar código.
