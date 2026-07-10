/* ============================================================================
   CDP · Control — Desbloqueo "la plata" (facturación real desde Tango)
   ----------------------------------------------------------------------------
   Para: Sistemas / DBA de DS Group (Reven como interlocutor si corresponde).
   Qué hace: crea UNA vista read-only nueva, hermana de la que ya existe
   (vw_VentasInsumoDiaria), con el MISMO grano pero agregando el IMPORTE.
   Es ADITIVO: no toca ninguna vista ni permiso existente. No rompe nada.

   Por qué: hoy el dashboard ve solo UNIDADES. El importe ya está en la tabla
   de renglones (CTA_DETALLE_COMANDA.IMPORTE_NETO); esta vista lo expone al
   mismo usuario read-only (cdp_lectura) que ya usa la app.

   Grano de salida (una fila por): fecha · sucursal · SKU · turno
     fecha              DATE      -> día comercial (FECHA_COMERCIAL)
     sucursal_canonico  VARCHAR   -> DESC_SUCURSAL
     sku                VARCHAR   -> COD_ARTICULO
     nombre             VARCHAR   -> DESC_CTA_ARTICULO
     turno              VARCHAR   -> 'mediodia' | 'tarde' | 'noche' (de la hora)
     unidades           DECIMAL   -> SUM(CANTIDAD)
     importe            DECIMAL   -> SUM(IMPORTE_NETO)   <-- lo nuevo
   ============================================================================ */

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
WHERE  d.ESTADO = 'P'                -- solo ventas válidas (excluye anulados/dev/invit.)
GROUP BY CAST(d.FECHA_COMERCIAL AS date), s.DESC_SUCURSAL, a.COD_ARTICULO, a.DESC_CTA_ARTICULO, t.turno;
GO

-- Permiso para el mismo usuario read-only que ya usa la app:
GRANT SELECT ON dbo.vw_VentasArticuloDiaria TO cdp_lectura;
GO


/* ---------------------------------------------------------------------------
   Verificación (correr después de crearla; deben salir importes > 0):
   --------------------------------------------------------------------------- */
-- SELECT TOP 20 * FROM dbo.vw_VentasArticuloDiaria
--   WHERE fecha = CAST(GETDATE() AS date) ORDER BY importe DESC;
-- SELECT fecha, SUM(importe) facturacion, SUM(unidades) u
--   FROM dbo.vw_VentasArticuloDiaria
--   WHERE fecha >= DATEADD(day,-7,CAST(GETDATE() AS date))
--   GROUP BY fecha ORDER BY fecha;


/* ---------------------------------------------------------------------------
   A CONFIRMAR con Sistemas (1 sola cosa) para que el número sea el correcto:
   - ¿IMPORTE_NETO es el importe del RENGLÓN (cantidad × precio) o unitario?
     (Se asume por renglón — que es lo normal en Restô. Si fuera unitario,
      la vista debería multiplicar por CANTIDAD.)
   - ¿IMPORTE_NETO es SIN IVA (neto) o CON IVA? Da igual cuál, pero hay que
     saberlo para comparar consistentemente contra COSTOS (margen real).
   Con esa confirmación, el número queda cerrado.
   --------------------------------------------------------------------------- */
