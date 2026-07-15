/* ============================================================================
   CDP · Control — Cuenta corriente de FRANQUICIAS en vivo (vista para cdp_lectura)
   ----------------------------------------------------------------------------
   Para: Sistemas / DBA de DS Group.
   Verificado contra el esquema REAL de Tango (jul-2026). Es ADITIVO: solo crea
   una vista de lectura. Reemplaza el Excel "ESTADO DE CTA. CTE. FRANQUICIAS".

   >>> DATO CLAVE (verificado) <<<
   - La cta cte vive en las bases POR SOCIEDAD (Mr_Tasty_SRL, El_Desembarco_2026…),
     NO en CENTRAL_ESTADISTICA (ahí la vista existe pero da 0 filas).
   - El usuario read-only del dashboard, `cdp_lectura`, SOLO puede loguearse en
     CENTRAL_ESTADISTICA (probado: "Login failed" contra Mr_Tasty_SRL).
   => Por eso la vista se crea EN CENTRAL_ESTADISTICA haciendo UNION de las bases
      de sociedad (consulta cross-database, con nombre de 3 partes), y el GRANT va
      en CENTRAL. Alternativa: darle login a cdp_lectura en cada base y crear la
      vista en cada una — pero el UNION en CENTRAL es lo más simple para la app.

   Tablas/vistas y COLUMNAS REALES (confirmadas):
     <base>.dbo.AXV_LIVE_COMPOSICION_SALDOS_CLIENTES  (la cta cte)
        ID_GVA14           -> id interno del cliente (join a AXV_CLIENTE)
        FECHA              -> fecha de EMISIÓN del comprobante   (#6)
        FECHA_VTO          -> vencimiento
        T_COMP + N_COMP    -> tipo + número de comprobante
        IMPORTE            -> importe del comprobante
        IMPORTE_CANCELADO  -> cobrado/aplicado
        ESTADO
     <base>.dbo.AXV_CLIENTE  (datos del franquiciado)
        ID_GVA14, COD_GVA14 (código), RAZON_SOCI, CUIT,
        TELEFONO_1, E_MAIL, SUCURSAL_DESC (nombre del local)
   ============================================================================ */

USE CENTRAL_ESTADISTICA;
GO

CREATE OR ALTER VIEW dbo.vw_FranquiciasCtaCte AS

/* ---- SOCIEDAD 1: Mr Tasty ------------------------------------------------ */
SELECT
    CAST(cli.COD_GVA14 AS varchar(20))          AS clienteId,
    LTRIM(RTRIM(cli.RAZON_SOCI))                 AS cliente,
    CAST(c.FECHA_VTO AS date)                    AS vencimiento,
    CAST(c.FECHA     AS date)                    AS emision,      -- #6 fecha de emisión
    LTRIM(RTRIM(c.T_COMP))                       AS tipo,
    LTRIM(RTRIM(c.N_COMP))                       AS nro,
    ISNULL(c.IMPORTE, 0)                         AS importe,
    ISNULL(c.IMPORTE_CANCELADO, 0)               AS cobrado,
    'Mr Tasty'                                   AS empresa,      -- literal por base
    ISNULL(LTRIM(RTRIM(cli.SUCURSAL_DESC)), '')  AS local,
    ''                                           AS detalle       -- concepto: ver nota (Raven/talonario)
FROM   Mr_Tasty_SRL.dbo.AXV_LIVE_COMPOSICION_SALDOS_CLIENTES c
LEFT   JOIN Mr_Tasty_SRL.dbo.AXV_CLIENTE cli ON cli.ID_GVA14 = c.ID_GVA14
WHERE  ISNULL(c.IMPORTE,0) - ISNULL(c.IMPORTE_CANCELADO,0) <> 0   -- solo lo pendiente

UNION ALL

/* ---- SOCIEDAD 2: El Desembarco ------------------------------------------ */
SELECT
    CAST(cli.COD_GVA14 AS varchar(20)),
    LTRIM(RTRIM(cli.RAZON_SOCI)),
    CAST(c.FECHA_VTO AS date),
    CAST(c.FECHA     AS date),
    LTRIM(RTRIM(c.T_COMP)),
    LTRIM(RTRIM(c.N_COMP)),
    ISNULL(c.IMPORTE, 0),
    ISNULL(c.IMPORTE_CANCELADO, 0),
    'Desembarco',
    ISNULL(LTRIM(RTRIM(cli.SUCURSAL_DESC)), ''),
    ''
FROM   El_Desembarco_2026.dbo.AXV_LIVE_COMPOSICION_SALDOS_CLIENTES c
LEFT   JOIN El_Desembarco_2026.dbo.AXV_CLIENTE cli ON cli.ID_GVA14 = c.ID_GVA14
WHERE  ISNULL(c.IMPORTE,0) - ISNULL(c.IMPORTE_CANCELADO,0) <> 0;

/* ---- (agregar más UNION ALL por cada sociedad que tenga cta cte de franquicias) */
GO

GRANT SELECT ON dbo.vw_FranquiciasCtaCte TO cdp_lectura;
GO

/* Verificación rápida (debería devolver filas): */
-- SELECT TOP 20 * FROM dbo.vw_FranquiciasCtaCte ORDER BY emision DESC;

/* ---------------------------------------------------------------------------
   A CONFIRMAR / AJUSTAR:
   1) Nombres exactos de las bases de sociedad (Mr_Tasty_SRL / El_Desembarco_2026)
      y si hay más (Mila & Go, etc.) -> un UNION ALL por cada una.
   2) 'detalle' (concepto: CDP / REGALIAS / MARKETING) NO está en la cabecera del
      comprobante (LEYENDA/COD_CLASIF vienen vacías; el talonario separa por TIPO
      de comprobante, no por concepto). Se deja en ''. Para llenarlo: derivarlo de
      los RENGLONES/artículos de la factura (mercadería=CDP vs artículo de
      regalías) — ver docs (chequeo de concepto) — o traerlo de Raven.
   3) La app ya consume esta vista: bridge GET /franquicias + push (tipo
      "franquicias") + FRANQUICIAS_SOURCE=live. No hay que tocar código.
   --------------------------------------------------------------------------- */
