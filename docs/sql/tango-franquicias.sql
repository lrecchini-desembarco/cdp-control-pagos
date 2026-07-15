/* ============================================================================
   CDP · Control — Cuenta corriente de FRANQUICIAS en vivo (vista para cdp_lectura)
   ----------------------------------------------------------------------------
   Verificado contra el esquema y los DATOS reales de Tango (jul-2026).

   >>> Estado del relevamiento <<<
   - La cta cte de franquicias vive en las bases POR SOCIEDAD:
       El_Desembarco   -> 292 fc pendientes, ~$425,6M   (¡NO El_Desembarco_2026, que está vacía!)
       Mr_Tasty_SRL    ->  79 fc pendientes, ~$84,7M
     Total ~$510M ≈ los $480M del Excel. La deuda COMPLETA (incluido el CDP) está en Tango.
   - cdp_lectura solo se loguea en CENTRAL_ESTADISTICA -> la vista se crea acá con
     UNION cross-database. Ya se otorgó SELECT a cdp_lectura en cada sociedad sobre
     AXV_LIVE_COMPOSICION_SALDOS_CLIENTES, AXV_CLIENTE y GVA12.
   - EMISIÓN (#6): c.FECHA. VENCIMIENTO: c.FECHA_VTO.
   - CONCEPTO (#4): la leyenda del comprobante viene VACÍA. El discriminador es el
     TALONARIO (g.TALONARIO). Confirmado por monto: Talonario 1 = CDP ($319,7M ≈ CDP
     del Excel). Faltan los nombres de los otros talonarios -> completar el CASE de abajo
     (se ven en Tango: Archivos -> Talonarios de facturación).
   ============================================================================ */

USE CENTRAL_ESTADISTICA;
GO

CREATE OR ALTER VIEW dbo.vw_FranquiciasCtaCte AS

/* ---- SOCIEDAD 1: Mr Tasty ------------------------------------------------ */
SELECT
    CAST(cli.COD_GVA14 AS varchar(20))          AS clienteId,
    LTRIM(RTRIM(cli.RAZON_SOCI))                 AS cliente,
    CAST(c.FECHA_VTO AS date)                    AS vencimiento,
    CAST(c.FECHA     AS date)                    AS emision,
    LTRIM(RTRIM(c.T_COMP))                       AS tipo,
    LTRIM(RTRIM(c.N_COMP))                       AS nro,
    ISNULL(c.IMPORTE, 0)                         AS importe,
    ISNULL(c.IMPORTE_CANCELADO, 0)               AS cobrado,
    'Mr Tasty'                                   AS empresa,
    ISNULL(LTRIM(RTRIM(cli.SUCURSAL_DESC)), '')  AS local,
    CASE g.TALONARIO
        WHEN 1 THEN 'CDP'
        WHEN 3 THEN 'Talonario 3'      -- completar
        ELSE 'Talonario ' + CAST(g.TALONARIO AS varchar(10))
    END                                          AS detalle
FROM   Mr_Tasty_SRL.dbo.AXV_LIVE_COMPOSICION_SALDOS_CLIENTES c
LEFT   JOIN Mr_Tasty_SRL.dbo.AXV_CLIENTE cli ON cli.ID_GVA14 = c.ID_GVA14
LEFT   JOIN Mr_Tasty_SRL.dbo.GVA12      g   ON g.ID_GVA12  = c.ID_GVA12
WHERE  ISNULL(c.IMPORTE,0) - ISNULL(c.IMPORTE_CANCELADO,0) <> 0

UNION ALL

/* ---- SOCIEDAD 2: El Desembarco (base El_Desembarco, NO la _2026) --------- */
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
    CASE g.TALONARIO
        WHEN 1   THEN 'CDP'
        WHEN 30  THEN 'Talonario 30'   -- completar
        WHEN 100 THEN 'Talonario 100'  -- completar
        WHEN 3   THEN 'Talonario 3'    -- completar
        WHEN 32  THEN 'Talonario 32'   -- completar
        ELSE 'Talonario ' + CAST(g.TALONARIO AS varchar(10))
    END
FROM   El_Desembarco.dbo.AXV_LIVE_COMPOSICION_SALDOS_CLIENTES c
LEFT   JOIN El_Desembarco.dbo.AXV_CLIENTE cli ON cli.ID_GVA14 = c.ID_GVA14
LEFT   JOIN El_Desembarco.dbo.GVA12      g   ON g.ID_GVA12  = c.ID_GVA12
WHERE  ISNULL(c.IMPORTE,0) - ISNULL(c.IMPORTE_CANCELADO,0) <> 0;
GO

GRANT SELECT ON dbo.vw_FranquiciasCtaCte TO cdp_lectura;
GO

/* Verificación:  SELECT empresa, COUNT(*) n, SUM(importe-cobrado) saldo
                  FROM dbo.vw_FranquiciasCtaCte GROUP BY empresa;          */

/* ---------------------------------------------------------------------------
   PENDIENTE: completar los nombres de los talonarios en los dos CASE (arriba)
   con lo que diga Tango en "Talonarios de facturación". Con eso el 'detalle'
   (concepto: CDP / Regalías / Marketing / Gestión apps / Toma local / N.Débito)
   sale 100% de Tango, sin depender de Raven. La app ya consume esta vista
   (bridge /franquicias + push + FRANQUICIAS_SOURCE=live).
   OJO 'local': cli.SUCURSAL_DESC vino "Casa central" para todos -> NO es el local
   del franquiciado. Si hay un campo del local real del cliente, reemplazarlo acá.
   --------------------------------------------------------------------------- */
