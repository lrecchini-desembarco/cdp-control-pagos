/* ============================================================================
   Descubrir el esquema de Tango — correr en la base de Tango (SQL Server)
   Objetivo: identificar las tablas/columnas reales para armar la vista de ventas.
   Corré las 3 y pegá los resultados (sobre todo #2 y #3).
   ============================================================================ */

-- 1) ¿Tengo permisos para crear vistas y usuario?
SELECT IS_SRVROLEMEMBER('sysadmin') AS sysadmin, IS_MEMBER('db_owner') AS db_owner;

-- 2) Tablas candidatas: comprobantes de venta, renglones (detalle), artículos, sucursales
SELECT TABLE_SCHEMA, TABLE_NAME
FROM   INFORMATION_SCHEMA.TABLES
WHERE  TABLE_TYPE = 'BASE TABLE'
  AND (TABLE_NAME LIKE '%comprob%' OR TABLE_NAME LIKE '%factur%' OR TABLE_NAME LIKE '%vent%'
    OR TABLE_NAME LIKE '%rengl%'  OR TABLE_NAME LIKE '%articul%' OR TABLE_NAME LIKE '%sucursal%'
    OR TABLE_NAME LIKE '%deposito%' OR TABLE_NAME LIKE '%comanda%' OR TABLE_NAME LIKE '%ticket%')
ORDER BY TABLE_NAME;

-- 3) Columnas clave: fecha (¿con hora?), cantidad, artículo, anulado, importe
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM   INFORMATION_SCHEMA.COLUMNS
WHERE  COLUMN_NAME LIKE '%fecha%' OR COLUMN_NAME LIKE '%hora%'
    OR COLUMN_NAME LIKE '%cantidad%' OR COLUMN_NAME LIKE '%articul%'
    OR COLUMN_NAME LIKE '%anula%'  OR COLUMN_NAME LIKE '%importe%' OR COLUMN_NAME LIKE '%total%'
ORDER BY TABLE_NAME, COLUMN_NAME;
