/* ============================================================================
   CDP · Control — Setup de Tango (SQL Server)
   ----------------------------------------------------------------------------
   Para: equipo de Sistemas / DBA de DS Group.
   Qué hace: crea 2 VISTAS read-only que consume el dashboard y un USUARIO de
   solo-lectura. La app NUNCA toca las tablas internas de Tango, solo estas vistas.

   Cómo usar:
   1) Reemplazá los nombres marcados con  -- <<  por los reales de tu base Tango.
   2) Ejecutá este script en la base de Tango (con un usuario con permisos).
   3) Pasale al equipo del dashboard: host, puerto, nombre de base, y la
      contraseña que definas para 'lectura_cdp'.

   Las dos vistas:
     dbo.vw_VentasInsumoDiaria  -> ventas por SKU/sucursal/fecha/TURNO  (Ventas por turno + Cruce)
     dbo.vw_ArticulosCatalogo   -> maestro de artículos                 (Control de catálogo)

   IMPORTANTE para "Ventas por turno": el turno se deriva de la HORA del
   comprobante. La columna de fecha del comprobante debe ser DATETIME (con hora),
   no solo DATE. Ajustá los rangos horarios si tu operación usa otros.
   ============================================================================ */


/* ===========================================================================
   1) VENTAS por turno  ->  dbo.vw_VentasInsumoDiaria
   Salida (5 columnas, exactas): fecha, sucursal_canonico, sku, turno, unidades
   =========================================================================== */
CREATE OR ALTER VIEW dbo.vw_VentasInsumoDiaria AS
SELECT
    CAST(c.fecha_emision AS DATE)              AS fecha,
    map.codigo_canonico                        AS sucursal_canonico,   -- << traducí la boca al código canónico (DS-FLO, MT-PIL…)
    r.cod_articulo                             AS sku,                 -- << código de artículo Tango (= skuVenta del mapeo)
    CASE
      WHEN DATEPART(HOUR, c.fecha_emision) >= 11 AND DATEPART(HOUR, c.fecha_emision) < 16 THEN 'mediodia'
      WHEN DATEPART(HOUR, c.fecha_emision) >= 16 AND DATEPART(HOUR, c.fecha_emision) < 20 THEN 'tarde'
      ELSE 'noche'
    END                                        AS turno,               -- << ajustá rangos (deben coincidir con lib/turnos.ts)
    SUM(r.cantidad)                            AS unidades
FROM   dbo.RENGLONES_VENTA      r          -- << tabla de renglones (detalle por artículo)
JOIN   dbo.COMPROBANTES_VENTA   c          -- << cabecera de comprobantes de venta
       ON c.id = r.id_comprobante           -- << clave que las relaciona
JOIN   dbo.MAP_SUCURSAL_CANONICO map       -- << equivalencia boca -> código canónico (tabla/aux propia)
       ON map.id_sucursal = c.id_sucursal
WHERE  c.anulado = 0                       -- << flag de anulado de tu esquema
   AND c.tipo IN ('FAC', 'TKT')            -- << tipos que SON venta (excluí NC/presupuestos si corresponde)
GROUP BY
    CAST(c.fecha_emision AS DATE),
    map.codigo_canonico,
    r.cod_articulo,
    CASE
      WHEN DATEPART(HOUR, c.fecha_emision) >= 11 AND DATEPART(HOUR, c.fecha_emision) < 16 THEN 'mediodia'
      WHEN DATEPART(HOUR, c.fecha_emision) >= 16 AND DATEPART(HOUR, c.fecha_emision) < 20 THEN 'tarde'
      ELSE 'noche'
    END;
GO


/* ===========================================================================
   2) CATÁLOGO de artículos  ->  dbo.vw_ArticulosCatalogo
   Salida: sku, nombre, marca, activo, ultima_venta, lista, lista_nombre,
           lista_marca, precio   (una fila por artículo × lista de precios)
   =========================================================================== */
CREATE OR ALTER VIEW dbo.vw_ArticulosCatalogo AS
SELECT
    a.cod_articulo                             AS sku,
    a.descripcion                              AS nombre,
    mm.marca                                   AS marca,          -- << equivalencia rubro/clasificación -> 'desembarco'|'tasty'|'mila'|NULL
    CASE WHEN a.inhabilitado = 0 THEN 1 ELSE 0 END AS activo,     -- << ajustá a tu flag de habilitado
    uv.ultima_venta                            AS ultima_venta,
    lp.cod_lista                               AS lista,
    lp.descripcion                             AS lista_nombre,
    lm.marca                                   AS lista_marca,    -- << equivalencia lista -> marca
    p.precio                                   AS precio
FROM        dbo.ARTICULOS            a
LEFT JOIN   dbo.MARCA_POR_RUBRO      mm ON mm.id_rubro    = a.id_rubro       -- << tu equivalencia rubro->marca
LEFT JOIN   dbo.PRECIOS_ARTICULO     p  ON p.cod_articulo = a.cod_articulo
LEFT JOIN   dbo.LISTAS_PRECIOS       lp ON lp.cod_lista   = p.cod_lista
LEFT JOIN   dbo.MARCA_POR_LISTA      lm ON lm.cod_lista   = lp.cod_lista     -- << tu equivalencia lista->marca
LEFT JOIN  (
    SELECT cod_articulo, MAX(CAST(fecha_emision AS DATE)) AS ultima_venta
    FROM   dbo.RENGLONES_VENTA r
    JOIN   dbo.COMPROBANTES_VENTA c ON c.id = r.id_comprobante
    WHERE  c.anulado = 0
    GROUP  BY cod_articulo
) uv ON uv.cod_articulo = a.cod_articulo;
GO


/* ===========================================================================
   3) USUARIO read-only para la app
   =========================================================================== */
-- Crear el login (cambiá la contraseña):
-- CREATE LOGIN lectura_cdp WITH PASSWORD = 'PONÉ_UNA_CLAVE_FUERTE';
-- CREATE USER  lectura_cdp FOR LOGIN lectura_cdp;

GRANT SELECT ON dbo.vw_VentasInsumoDiaria TO lectura_cdp;
GRANT SELECT ON dbo.vw_ArticulosCatalogo  TO lectura_cdp;
GO


/* ===========================================================================
   4) Verificación rápida (corré esto para confirmar que devuelven datos)
   =========================================================================== */
-- SELECT TOP 10 * FROM dbo.vw_VentasInsumoDiaria ORDER BY fecha DESC;
-- SELECT turno, COUNT(*) filas, SUM(unidades) u FROM dbo.vw_VentasInsumoDiaria GROUP BY turno;
-- SELECT TOP 10 * FROM dbo.vw_ArticulosCatalogo;
