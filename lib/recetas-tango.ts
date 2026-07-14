import type { RecetaCosteada, ComponenteCosteado } from "./recetas";
import { precioConImpuestos, type Insumo } from "./insumos";

// Recetas REALES de Tango (vista dbo.V_QS_Recetas_Insumo_Final): cada producto
// (COD_ARTICU) con sus insumos finales (COD_INSUMO + NOM_INSUMO + CANTIDAD, ya
// explotados los sub-combos). Es el recetario que la cocina carga en Tango — 1500+
// productos, El Desembarco incluido. Los COSTOS no están en Tango; se cruzan
// best-effort contra el maestro de Insumos (Excel) por descripción normalizada.

export interface FilaRecetaTango {
  sku: string;        // COD_ARTICU
  nombre: string;     // NOM_ARTICU
  insumoCod: string;  // COD_INSUMO
  insumoDesc: string; // NOM_INSUMO
  cant: number;       // CANTIDAD
  clasif?: string;    // CLASIF_INSUMO (nivel 1)
}
export interface RecetaTango {
  sku: string;
  nombre: string;
  componentes: { cod: string; desc: string; cant: number; clasif?: string }[];
}

/** Agrupa las filas planas de la vista en recetas por producto. */
export function agruparRecetasTango(filas: FilaRecetaTango[]): RecetaTango[] {
  const m = new Map<string, RecetaTango>();
  for (const f of filas) {
    const sku = String(f.sku).trim();
    let r = m.get(sku);
    if (!r) { r = { sku, nombre: String(f.nombre ?? "").trim(), componentes: [] }; m.set(sku, r); }
    // saltear autorreferencia (un artículo que es su propio "insumo" = hoja sin receta real)
    if (String(f.insumoCod).trim() === sku) continue;
    r.componentes.push({ cod: String(f.insumoCod).trim(), desc: String(f.insumoDesc ?? "").trim(), cant: Number(f.cant) || 0, clasif: f.clasif || undefined });
  }
  // solo recetas con al menos un componente
  return Array.from(m.values()).filter((r) => r.componentes.length > 0);
}

const norm = (s: string) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Índice del maestro de Insumos por descripción normalizada (para cruzar precio). */
export function indiceInsumosPorDesc(insumos: Insumo[]): Map<string, Insumo> {
  const m = new Map<string, Insumo>();
  for (const i of insumos) { const k = norm(i.descripcion); if (k && !m.has(k)) m.set(k, i); }
  return m;
}

/** Cuesta una receta de Tango best-effort: muestra el nombre REAL del insumo (de
 *  Tango) y le pega el precio del maestro si matchea por descripción; si no, el
 *  componente queda sin costo (falta=true). El costo total es parcial por diseño. */
export function costearRecetaTango(rt: RecetaTango, idxDesc: Map<string, Insumo>, marca = ""): RecetaCosteada {
  const comps: ComponenteCosteado[] = rt.componentes.map((c) => {
    const ins = idxDesc.get(norm(c.desc));
    const precioUnidad = ins?.precioUnidad ?? 0;
    return { insumoCod: c.cod, cant: c.cant, insumoDesc: c.desc, precioUnidad, subtotal: c.cant * precioUnidad, pct: 0, falta: !ins };
  });
  const costoNeto = comps.reduce((a, c) => a + c.subtotal, 0);
  const costoConImp = comps.reduce((a, c) => {
    const ins = idxDesc.get(norm(c.insumoDesc));
    return a + (ins ? c.cant * precioConImpuestos(ins) : 0);
  }, 0);
  for (const c of comps) c.pct = costoNeto ? c.subtotal / costoNeto : 0;
  comps.sort((a, b) => b.subtotal - a.subtotal);
  return {
    skuTango: rt.sku, descripcion: rt.nombre, marca, version: 1, fecha: "", nVersiones: 1,
    componentes: comps, costoNeto, costoConImp, nFaltantes: comps.filter((c) => c.falta).length,
    fuente: "tango",
  };
}
