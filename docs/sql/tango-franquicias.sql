/* ============================================================================
   CDP · Control — Cuenta corriente de FRANQUICIAS en vivo (vista para cdp_lectura)
   ----------------------------------------------------------------------------
   Verificado contra el esquema Y LOS DATOS reales de Tango (jul-2026).

   RESUMEN DEL RELEVAMIENTO:
   - La cta cte de franquicias está en las bases POR SOCIEDAD:
       El_Desembarco  -> 292 fc pendientes ~$425,6M   (NO El_Desembarco_2026, vacía)
       Mr_Tasty_SRL   ->  79 fc pendientes ~$84,7M
     Total ~$510M. La deuda COMPLETA está en Tango.
   - cdp_lectura entra a CENTRAL_ESTADISTICA -> vista acá con UNION cross-DB.
     Grants ya dados en cada sociedad: AXV_LIVE_COMPOSICION_SALDOS_CLIENTES,
     AXV_CLIENTE, GVA12, GVA53 (renglones), STA11 (artículos).
   - EMISIÓN (#6) = c.FECHA. VENCIMIENTO = c.FECHA_VTO.
   - CONCEPTO (#4): NO está en leyenda ni talonario. SE DERIVA DEL ARTÍCULO de la
     factura (GVA53 -> STA11). Confirmado con datos: por el artículo dominante de
     cada factura. Deuda real: 67% Regalías, 19% CDP, 9% Gestión apps, 3% Marketing.
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
    /* CONCEPTO por el ARTÍCULO DOMINANTE de la factura (renglón de mayor importe) */
    ISNULL((
        SELECT TOP 1 CASE
            WHEN a.DESCRIPCIO LIKE '%REGAL%' OR a.DESCRIPCIO LIKE '%PUBLICID%'                 THEN 'Regalías'
            WHEN a.DESCRIPCIO LIKE '%MARKETING%'                                               THEN 'Marketing'
            WHEN a.DESCRIPCIO LIKE '%GESTI_N DE APLICAC%' OR a.DESCRIPCIO LIKE '%SISTEMA TANGO%' THEN 'Gestión apps'
            WHEN a.DESCRIPCIO LIKE '%VIAJE%'                                                    THEN 'Viajes'
            WHEN a.DESCRIPCIO LIKE '%ACUERDO COMERC%'                                           THEN 'Acuerdo comercial'
            WHEN a.DESCRIPCIO LIKE '%INFRACC%'                                                  THEN 'Infracción'
            ELSE 'CDP'
        END
        FROM Mr_Tasty_SRL.dbo.GVA53 r
        LEFT JOIN Mr_Tasty_SRL.dbo.STA11 a ON a.COD_ARTICU = r.COD_ARTICU
        WHERE r.N_COMP = c.N_COMP AND r.T_COMP = c.T_COMP
        ORDER BY (ISNULL(r.IMPORTE_GRAVADO,0) + ISNULL(r.IMPORTE_EXENTO,0)) DESC
    ), 'CDP')                                    AS detalle
FROM   Mr_Tasty_SRL.dbo.AXV_LIVE_COMPOSICION_SALDOS_CLIENTES c
LEFT   JOIN Mr_Tasty_SRL.dbo.AXV_CLIENTE cli ON cli.ID_GVA14 = c.ID_GVA14
WHERE  ISNULL(c.IMPORTE,0) - ISNULL(c.IMPORTE_CANCELADO,0) <> 0

UNION ALL

/* ---- SOCIEDAD 2: El Desembarco (base El_Desembarco) --------------------- */
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
    ISNULL((
        SELECT TOP 1 CASE
            WHEN a.DESCRIPCIO LIKE '%REGAL%' OR a.DESCRIPCIO LIKE '%PUBLICID%'                 THEN 'Regalías'
            WHEN a.DESCRIPCIO LIKE '%MARKETING%'                                               THEN 'Marketing'
            WHEN a.DESCRIPCIO LIKE '%GESTI_N DE APLICAC%' OR a.DESCRIPCIO LIKE '%SISTEMA TANGO%' THEN 'Gestión apps'
            WHEN a.DESCRIPCIO LIKE '%VIAJE%'                                                    THEN 'Viajes'
            WHEN a.DESCRIPCIO LIKE '%ACUERDO COMERC%'                                           THEN 'Acuerdo comercial'
            WHEN a.DESCRIPCIO LIKE '%INFRACC%'                                                  THEN 'Infracción'
            ELSE 'CDP'
        END
        FROM El_Desembarco.dbo.GVA53 r
        LEFT JOIN El_Desembarco.dbo.STA11 a ON a.COD_ARTICU = r.COD_ARTICU
        WHERE r.N_COMP = c.N_COMP AND r.T_COMP = c.T_COMP
        ORDER BY (ISNULL(r.IMPORTE_GRAVADO,0) + ISNULL(r.IMPORTE_EXENTO,0)) DESC
    ), 'CDP')
FROM   El_Desembarco.dbo.AXV_LIVE_COMPOSICION_SALDOS_CLIENTES c
LEFT   JOIN El_Desembarco.dbo.AXV_CLIENTE cli ON cli.ID_GVA14 = c.ID_GVA14
WHERE  ISNULL(c.IMPORTE,0) - ISNULL(c.IMPORTE_CANCELADO,0) <> 0;
GO

GRANT SELECT ON dbo.vw_FranquiciasCtaCte TO cdp_lectura;
GO

/* Verificación:
   SELECT detalle, COUNT(*) n, SUM(importe-cobrado) saldo
   FROM dbo.vw_FranquiciasCtaCte GROUP BY detalle ORDER BY saldo DESC;
   -> esperado ~ Regalías 67% · CDP 19% · Gestión apps 9% · Marketing 3% · Acuerdo 2%
   ----------------------------------------------------------------------------
   NOTA 'local': cli.SUCURSAL_DESC vino "Casa central" para todos (no es el local
   del franquiciado). Si aparece un campo con el local real, reemplazar ahí; si no,
   la app usa el nombre de local de Raven (que sí lo tiene bien).
   ============================================================================ */
