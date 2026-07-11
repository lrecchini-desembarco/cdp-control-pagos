/* ============================================================================
   CDP · Control — Bancos / Tesorería (liquidaciones de tarjeta + movimientos)
   ----------------------------------------------------------------------------
   Para: Sistemas / DBA de DS Group (Reven como interlocutor si corresponde).
   Qué hace: expone en UNA vista read-only los movimientos de tesorería/bancos
   que ya están en Tango (módulo Tesorería / Bancos), con el grano que el
   dashboard necesita para armar los resúmenes. Es ADITIVO: no toca nada.

   Objetivo del dashboard (pantalla "Bancos"): mostrar, sin subir CSV a mano,
   lo que las tarjetas/bancos liquidan (bruto, comisión, neto acreditado) y los
   movimientos de cuenta (ingresos/egresos), por medio, banco, local y día.

   Grano de salida (una fila por movimiento o por liquidación diaria):
     fecha              DATE     -> fecha de acreditación / del movimiento
     banco              VARCHAR  -> entidad / cuenta bancaria
     medio              VARCHAR  -> medio de pago o tarjeta (Visa, Master, débito, …)
     local              VARCHAR  -> sucursal / comercio (para cruzar con ventas)
     concepto           VARCHAR  -> descripción del movimiento (para extractos)
     bruto              DECIMAL  -> importe bruto / presentado (0 si no aplica)
     comision           DECIMAL  -> arancel / comisión / retención (0 si no aplica)
     neto               DECIMAL  -> neto acreditado (bruto - comisión)
     ingreso            DECIMAL  -> crédito / haber (extractos; 0 si no aplica)
     egreso             DECIMAL  -> débito / debe   (extractos; 0 si no aplica)
     comprobante        VARCHAR  -> lote / liquidación / nro de operación

   NOTA: los nombres de tabla/campo de abajo son PLACEHOLDERS — Sistemas los
   reemplaza por los reales del módulo Tesorería de Tango (p.ej. TES_MOVIMIENTO,
   TES_CUENTA, TES_MEDIO_COBRO). Lo importante es respetar el grano de salida y
   dar SELECT al mismo usuario read-only que ya usa la app (cdp_lectura).
   ============================================================================ */

-- USE [<base_de_tesoreria>];
-- GO

/*
CREATE OR ALTER VIEW dbo.vw_BancosMovDiario AS
SELECT
    CAST(m.FECHA AS date)          AS fecha,
    c.DESC_CUENTA                  AS banco,
    mp.DESC_MEDIO                  AS medio,
    s.DESC_SUCURSAL                AS local,
    m.CONCEPTO                     AS concepto,
    ISNULL(m.IMPORTE_BRUTO, 0)     AS bruto,
    ISNULL(m.COMISION, 0)          AS comision,
    ISNULL(m.IMPORTE_NETO,
           ISNULL(m.IMPORTE_BRUTO,0) - ISNULL(m.COMISION,0)) AS neto,
    CASE WHEN m.IMPORTE > 0 THEN m.IMPORTE ELSE 0 END  AS ingreso,
    CASE WHEN m.IMPORTE < 0 THEN -m.IMPORTE ELSE 0 END AS egreso,
    m.COMPROBANTE                  AS comprobante
FROM   dbo.TES_MOVIMIENTO m
LEFT   JOIN dbo.TES_CUENTA     c  ON c.ID_CUENTA = m.ID_CUENTA
LEFT   JOIN dbo.TES_MEDIO_COBRO mp ON mp.ID_MEDIO = m.ID_MEDIO
LEFT   JOIN dbo.SUCURSAL       s  ON s.ID_SUCURSAL = m.ID_SUCURSAL
WHERE  m.ESTADO = 'C';   -- confirmados (ajustar al esquema real)
GO

GRANT SELECT ON dbo.vw_BancosMovDiario TO cdp_lectura;
GO
*/

/* ---------------------------------------------------------------------------
   A CONFIRMAR con Sistemas antes de cablearla:
   - ¿La tesorería/bancos se carga en Tango, o solo se maneja por fuera
     (portales de adquirentes + homebanking)? Si es por fuera, el camino es el
     CSV de la pantalla Bancos (ya funciona), no esta vista.
   - ¿El importe de tarjeta viene BRUTO con comisión aparte, o ya NETO?
   - ¿Hay una dimensión de "local/comercio" para cruzar con ventas, o el banco
     liquida consolidado (sin abrir por sucursal)?
   Con eso confirmado, se conecta un adapter (lib/sources) igual que Tango ventas
   y la pantalla pasa de "subí el CSV" a vivo.
   --------------------------------------------------------------------------- */
