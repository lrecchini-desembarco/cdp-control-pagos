import { precioConImpuestos, type Insumo } from "./insumos";

// Recetas (BOM) versionadas. Cada receta es un producto (SKU de Tango) con sus
// componentes = insumo + cantidad. El costo se calcula SIEMPRE contra el maestro
// de Insumos vigente (editar un costo actualiza todas las recetas). Cada guardado
// crea una versión nueva; se conserva el historial.

export interface Componente {
  insumoCod: string; // referencia al cód. del maestro de Insumos
  cant: number;      // en la unidad de receta del insumo (unidades o gramos)
}
export interface VersionReceta {
  version: number;
  fecha: string;     // ISO
  autor?: string;
  componentes: Componente[];
}
export interface Receta {
  skuTango: string;  // clave — Cód. Art. Tango (= SKU de venta)
  descripcion: string;
  marca: string;     // "Mr. Tasty" | "Mila & Go" | "El Desembarco"
  versiones: VersionReceta[]; // la última es la vigente
}

export interface ComponenteCosteado extends Componente {
  insumoDesc: string;
  precioUnidad: number;
  subtotal: number;   // cant × precioUnidad (neto)
  pct: number;        // % de participación en el costo neto
  falta: boolean;     // true si el insumo no está en el maestro
}
export interface RecetaCosteada {
  skuTango: string;
  descripcion: string;
  marca: string;
  version: number;
  fecha: string;
  nVersiones: number;
  componentes: ComponenteCosteado[];
  costoNeto: number;
  costoConImp: number;
  nFaltantes: number;
}

/** Índice de insumos por código, case-insensitive (las recetas del Excel varían mayúsculas). */
export function indiceInsumos(insumos: Insumo[]): Map<string, Insumo> {
  const m = new Map<string, Insumo>();
  for (const i of insumos) m.set(i.cod.toLowerCase(), i);
  return m;
}

export const versionVigente = (r: Receta): VersionReceta | undefined =>
  r.versiones[r.versiones.length - 1];

/** Cuesta la versión vigente de una receta contra el maestro de insumos. */
export function costearReceta(r: Receta, idx: Map<string, Insumo>): RecetaCosteada {
  const v = versionVigente(r);
  const comps: ComponenteCosteado[] = (v?.componentes ?? []).map((c) => {
    const ins = idx.get(c.insumoCod.toLowerCase());
    const precioUnidad = ins?.precioUnidad ?? 0;
    return {
      insumoCod: c.insumoCod,
      cant: c.cant,
      insumoDesc: ins?.descripcion ?? "(falta en el maestro)",
      precioUnidad,
      subtotal: c.cant * precioUnidad,
      pct: 0,
      falta: !ins,
    };
  });
  const costoNeto = comps.reduce((a, c) => a + c.subtotal, 0);
  const costoConImp = comps.reduce((a, c) => {
    const ins = idx.get(c.insumoCod.toLowerCase());
    return a + (ins ? c.cant * precioConImpuestos(ins) : 0);
  }, 0);
  for (const c of comps) c.pct = costoNeto ? c.subtotal / costoNeto : 0;
  comps.sort((a, b) => b.subtotal - a.subtotal);
  return {
    skuTango: r.skuTango,
    descripcion: r.descripcion,
    marca: r.marca,
    version: v?.version ?? 1,
    fecha: v?.fecha ?? "",
    nVersiones: r.versiones.length,
    componentes: comps,
    costoNeto,
    costoConImp,
    nFaltantes: comps.filter((c) => c.falta).length,
  };
}
