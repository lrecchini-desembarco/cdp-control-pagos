/* ============================================================================
   CDP · Control — Cuentas Corrientes de Franquicias (estado de cuenta en vivo)
   ----------------------------------------------------------------------------
   Para: Sistemas / DBA de DS Group (Reven como interlocutor si corresponde).
   Qué hace: expone en UNA vista read-only el estado de cuenta de los
   franquiciados (clientes de la cta cte de Tango) con el grano exacto que el
   dashboard ya usa. Es ADITIVO: no toca datos, no cambia nada. Reemplaza el
   Excel "ESTADO DE CTA. CTE. FRANQUICIAS" que hoy se sube a mano.

   Objetivo (pantalla "Franquicias · Cuentas Corrientes"): que la deuda de cada
   franquiciado se lea sola de Tango (una fila por comprobante pendiente), y la
   app le siga calculando encima mora, tasa, punitorios, aging, morosidad y
   gestión de cobranza — sin subir ningún archivo.

   Grano de salida (UNA fila por comprobante pendiente):
     clienteId    VARCHAR  -> código del cliente en Tango (ID/COD)
     cliente      VARCHAR  -> razón social del franquiciado
     vencimiento  DATE     -> fecha de vencimiento del comprobante
     tipo         VARCHAR  -> tipo de comprobante (FAC, N/C, REC, …)
     nro          VARCHAR  -> número de comprobante (formateado)
     importe      DECIMAL  -> importe ORIGINAL de la deuda (total del comprobante)
     cobrado      DECIMAL  -> importe ya cancelado/aplicado
     empresa      VARCHAR  -> marca / sociedad (Mr Tasty, Desembarco, Mila & Go)
     local        VARCHAR  -> sucursal / local del franquiciado (best-effort)
     detalle      VARCHAR  -> concepto (CDP, REGALIAS, INCOBRABLES…) best-effort
   El saldo (importe - cobrado), la mora y el punitorio los calcula la app; NO
   hace falta que la vista los traiga.

   ----------------------------------------------------------------------------
   FUENTE (según lo relevado): la cta cte de franquicias es contabilidad de
   Tango; los franquiciados son CLIENTES. La composición de saldos está en:
       AXV_LIVE_COMPOSICION_SALDOS_CLIENTES
         ID_GVA12          -> cliente
         T_COMP + N_COMP   -> tipo + nro de comprobante
         FECHA_VTO         -> vencimiento
         IMPORTE           -> importe del comprobante
         IMPORTE_CANCELADO -> cobrado/aplicado
         ESTADO            -> estado del comprobante
   y los nombres/datos del cliente en AXV_CLIENTE.
   OJO (relevado jul-2026): estas vistas viven en las bases POR EMPRESA
   (Mr_Tasty_SRL, El_Desembarco_2026, …); en CENTRAL_ESTADISTICA vienen VACÍAS.
   Por eso "empresa" suele ser constante por base (ver abajo). Los nombres de
   tabla/campo son los relevados; Sistemas confirma/ajusta contra el esquema real.
   ============================================================================ */

-- Correr en la base de la EMPRESA que tenga la cta cte (repetir por sociedad, o
-- unir con UNION ALL si están consolidadas). Ejemplo para una sociedad:
-- USE [Mr_Tasty_SRL];
-- GO

/*
CREATE OR ALTER VIEW dbo.vw_FranquiciasCtaCte AS
SELECT
    CAST(c.ID_GVA12 AS varchar(20))                         AS clienteId,
    LTRIM(RTRIM(cli.RAZON_SOCI))                            AS cliente,
    CAST(c.FECHA_VTO AS date)                               AS vencimiento,
    LTRIM(RTRIM(c.T_COMP))                                  AS tipo,
    LTRIM(RTRIM(c.N_COMP))                                  AS nro,
    ISNULL(c.IMPORTE, 0)                                    AS importe,
    ISNULL(c.IMPORTE_CANCELADO, 0)                          AS cobrado,
    'Mr Tasty'                                              AS empresa,   -- constante por base; ajustar por sociedad
    ISNULL(LTRIM(RTRIM(cli.ZONA)), '')                      AS local,     -- best-effort (zona/sucursal del cliente)
    ISNULL(LTRIM(RTRIM(c.LEYENDA)), '')                     AS detalle    -- best-effort (concepto/leyenda del comprobante)
FROM   dbo.AXV_LIVE_COMPOSICION_SALDOS_CLIENTES c
LEFT   JOIN dbo.AXV_CLIENTE cli ON cli.ID_GVA12 = c.ID_GVA12
WHERE  ISNULL(c.IMPORTE, 0) - ISNULL(c.IMPORTE_CANCELADO, 0) <> 0;  -- solo lo pendiente
GO

GRANT SELECT ON dbo.vw_FranquiciasCtaCte TO cdp_lectura;
GO
*/

/* ---------------------------------------------------------------------------
   A CONFIRMAR con Sistemas antes de cablearla:
   1) ¿En qué base(s) vive la cta cte de franquicias? ¿Una por sociedad
      (Mr_Tasty_SRL / El_Desembarco_2026 / …) o hay una consolidada? Si son
      varias, esta vista se crea en cada una (con su 'empresa' literal) y el
      bridge las lee todas, o se unen con UNION ALL en una sola vista.
   2) 'importe' debe ser el TOTAL del comprobante e 'cobrado' lo aplicado, de
      modo que importe - cobrado = SALDO pendiente (así lo espera la app).
      ¿IMPORTE ya es el pendiente, o es el total? Ajustar si hiciera falta.
   3) ¿Hay dimensión de 'local' del franquiciado (sucursal/zona) y de 'detalle'
      (concepto: CDP / REGALIAS / INCOBRABLES…)? Si no existen en Tango, se
      dejan en '' — la app funciona igual (esas columnas son enriquecimiento;
      hoy se cargan a mano en el Excel). El campo 'detalle' es el único que hoy
      agrega valor del lado del negocio; ver si hay una leyenda/rubro utilizable.
   4) Confirmar que el mismo usuario read-only de siempre (cdp_lectura) puede
      leer la vista (GRANT SELECT). Es el mismo patrón que recetas y bancos.

   Cuando la vista exista + tenga permiso, del lado del dashboard NO hay que
   programar nada más: el bridge ya expone GET /franquicias, el push la empuja
   al KV y la app la usa con FRANQUICIAS_SOURCE=live (ver docs/tango-bridge.md).
   La app le sigue sumando punitorios, aging, morosidad, gestión, cobros y el
   maestro por encima del dato vivo.
   --------------------------------------------------------------------------- */
