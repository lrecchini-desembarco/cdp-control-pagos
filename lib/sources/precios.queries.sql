/* ============================================================
   vw_PreciosProducto — precio vigente por producto y sucursal
   ------------------------------------------------------------
   Base: CENTRAL_ESTADISTICA (Tango Restô). Las LISTAS de precios están vacías
   en esta base, así que el "precio vigente" se toma del PRECIO EFECTIVO de la
   última venta de cada producto en cada sucursal (CTA_DETALLE_COMANDA).

   Salida (las columnas que lee lib/sources/tango.ts):
     sku          VARCHAR  -> COD_ARTICULO
     nombre       VARCHAR  -> DESC_CTA_ARTICULO
     sucursal     VARCHAR  -> DESC_SUCURSAL
     precio       DECIMAL  -> PVP unitario CON impuestos (IMPORTE_CON_IMPUESTOS/CANTIDAD)
     precio_neto  DECIMAL  -> precio unitario NETO (IMPORTE_NETO/CANTIDAD)
     actualizado  DATE     -> fecha de la venta que fijó el precio
   ============================================================ */

USE [CENTRAL_ESTADISTICA];
GO

-- Precio vigente = el precio unitario MÁS FRECUENTE (moda) de los últimos 90 días
-- por producto x sucursal. La moda + ventana reciente + piso descartan outliers
-- (ventas a $1, correcciones, promos) y reflejan el precio actual (clave con inflación).
CREATE OR ALTER VIEW dbo.vw_PreciosProducto AS
WITH v AS (
  SELECT
    d.ID_CTA_ARTICULO,
    d.ID_SUCURSAL,
    CAST(d.IMPORTE_CON_IMPUESTOS / d.CANTIDAD AS decimal(18,2)) AS pu,
    CAST(d.IMPORTE_NETO          / d.CANTIDAD AS decimal(18,2)) AS pu_neto,
    d.FECHA
  FROM dbo.CTA_DETALLE_COMANDA d
  WHERE d.ESTADO = 'P'
    AND d.CANTIDAD > 0
    AND d.IMPORTE_CON_IMPUESTOS / d.CANTIDAD >= 100                 -- descarta ventas basura ($1, ajustes)
    AND d.FECHA >= DATEADD(day, -90, CAST(GETDATE() AS date))       -- solo precios recientes
),
modo AS (
  SELECT
    ID_CTA_ARTICULO, ID_SUCURSAL, pu,
    MAX(pu_neto) AS pu_neto,
    MAX(FECHA)   AS ult,
    ROW_NUMBER() OVER (
      PARTITION BY ID_CTA_ARTICULO, ID_SUCURSAL
      ORDER BY COUNT(*) DESC, MAX(FECHA) DESC          -- el más vendido; desempata el más reciente
    ) AS rn
  FROM v
  GROUP BY ID_CTA_ARTICULO, ID_SUCURSAL, pu
)
SELECT
  a.COD_ARTICULO      AS sku,
  a.DESC_CTA_ARTICULO AS nombre,
  s.DESC_SUCURSAL     AS sucursal,
  m.pu                AS precio,
  m.pu_neto           AS precio_neto,
  CAST(m.ult AS date) AS actualizado
FROM   modo m
JOIN   dbo.CTA_ARTICULO a ON a.ID_CTA_ARTICULO = m.ID_CTA_ARTICULO
JOIN   dbo.SUCURSAL     s ON s.ID_SUCURSAL     = m.ID_SUCURSAL
WHERE  m.rn = 1;
GO

-- Permiso para el usuario de la app:
GRANT SELECT ON dbo.vw_PreciosProducto TO cdp_lectura;
GO

/* Probar:
   SELECT TOP 30 * FROM dbo.vw_PreciosProducto ORDER BY nombre, sucursal;
*/
