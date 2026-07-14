"use client";

import { useEffect, useState } from "react";

// Modal para ver la receta de un producto (por SKU de Tango). Sirve para corroborar
// si un producto tiene receta cargada y si está COMPLETA (insumos que faltan en el
// maestro). Lee /api/recetas?sku=... (recetas costeadas).
interface Comp { insumoCod: string; cant: number; insumoDesc: string; subtotal: number; falta: boolean }
interface Costeada { skuTango: string; descripcion: string; marca: string; componentes: Comp[]; costoNeto: number; nFaltantes: number }
const $ = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

export default function RecetaModal({ sku, nombre, onClose }: { sku: string; nombre: string; onClose: () => void }) {
  const [receta, setReceta] = useState<Costeada | null | undefined>(undefined); // undefined = cargando, null = no existe

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const j = await (await fetch(`/api/recetas?sku=${encodeURIComponent(sku)}`, { cache: "no-store" })).json();
        const r = (j.recetas ?? []).find((x: Costeada) => x.skuTango === sku);
        if (vivo) setReceta(r ?? null);
      } catch { if (vivo) setReceta(null); }
    })();
    return () => { vivo = false; };
  }, [sku]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-card border border-line bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-ink">{nombre}</p>
            <p className="text-2xs text-faint">SKU {sku}{receta ? ` · ${receta.marca}` : ""}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-2xs font-medium text-muted hover:text-ink">cerrar</button>
        </div>

        {receta === undefined ? (
          <p className="py-6 text-center text-2xs text-faint">Cargando receta…</p>
        ) : receta === null ? (
          <div className="rounded-md border border-warn/30 bg-warn/[0.07] px-3 py-4 text-2xs leading-relaxed text-warn">
            <b>Este producto no tiene receta cargada.</b> Por eso figura “sin receta”: no entra a la estimación de insumos ni al margen. Cargala en <b>Recetas</b> (SKU {sku}) y aparece solo.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="py-1.5 font-medium">Insumo</th>
                  <th className="py-1.5 text-right font-medium">Cant.</th>
                  <th className="py-1.5 text-right font-medium">Costo</th>
                </tr></thead>
                <tbody>
                  {receta.componentes.map((c, i) => (
                    <tr key={i} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 text-ink">{c.insumoDesc} {c.falta && <span className="ml-1 rounded bg-bad/10 px-1 py-px text-[10px] font-medium text-bad">falta en maestro</span>}</td>
                      <td className="py-1.5 text-right font-mono text-2xs text-muted">{c.cant}</td>
                      <td className="py-1.5 text-right font-mono text-xs text-ink">{c.subtotal ? $(c.subtotal) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs">
              <span className="text-muted">{receta.componentes.length} insumos{receta.nFaltantes ? ` · ${receta.nFaltantes} sin costo` : ""}</span>
              <span className="font-mono font-semibold text-ink">Costo receta: {$(receta.costoNeto)}</span>
            </div>
            {receta.nFaltantes > 0 && <p className="mt-2 text-2xs text-warn">⚠ {receta.nFaltantes} insumo(s) no están en el maestro de costos → la receta está <b>incompleta</b> (el costo/estimación quedan cortos).</p>}
          </>
        )}
      </div>
    </div>
  );
}
