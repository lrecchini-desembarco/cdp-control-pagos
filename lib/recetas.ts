import { precioConImpuestos, type Insumo } from "./insumos";
import type { ProductoMap } from "./types";

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
// Canal de venta a nivel producto (dónde se vende, no confundir con lib/canales.ts
// que son las apps de delivery con sus comisiones).
export type CanalVenta = "salon" | "mostrador" | "delivery";
export const CANALES_VENTA: { id: CanalVenta; label: string }[] = [
  { id: "salon", label: "Salón" },
  { id: "mostrador", label: "Mostrador" },
  { id: "delivery", label: "Delivery" },
];

export interface Receta {
  skuTango: string;  // clave — Cód. Art. Tango (= SKU de venta)
  descripcion: string;
  marca: string;     // "Mr. Tasty" | "Mila & Go" | "El Desembarco"
  grupo?: string;    // grupo de productos (maestro) — para agrupar y ordenar
  orden?: number;    // orden manual dentro del grupo (el que pide Diego)
  canales?: CanalVenta[]; // dónde se vende: salón / mostrador / delivery
  versiones: VersionReceta[]; // la última es la vigente (puede estar vacía: producto sin receta aún)
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
  grupo?: string;
  orden?: number;
  canales?: CanalVenta[];
  version: number;
  fecha: string;
  nVersiones: number;
  componentes: ComponenteCosteado[];
  costoNeto: number;
  costoConImp: number;
  nFaltantes: number;
  sinReceta?: boolean; // producto del maestro que todavía no tiene receta cargada
  fuente?: "tango"; // la receta vino del recetario de Tango (cocina), no del maestro editable
}

/** Índice de insumos por código, case-insensitive (las recetas del Excel varían mayúsculas). */
export function indiceInsumos(insumos: Insumo[]): Map<string, Insumo> {
  const m = new Map<string, Insumo>();
  for (const i of insumos) m.set(i.cod.toLowerCase(), i);
  return m;
}

export const versionVigente = (r: Receta): VersionReceta | undefined =>
  r.versiones[r.versiones.length - 1];

// Insumos del CDP que Raven trackea (los únicos que cruzan pedido vs venta).
// El resto de los insumos de la receta (pan, cheddar, packaging) no entra al cruce.
const INS_A_CDP: Record<string, { cdp: string; nombre: string }> = {
  tuki80: { cdp: "083009", nombre: "Medallón Tuki 80g" },
  medallon55: { cdp: "083041", nombre: "Medallón Tuki 55g" },
  "bolas blend": { cdp: "050027", nombre: "Bolas Blend 100g" },
};

/** Deriva el productoMap del Cruce a partir de las recetas vigentes: por cada
 *  componente que sea un insumo del CDP, una regla skuVenta -> insumo × cantidad.
 *  Así editar una receta cambia el cruce (fuente única, sin hardcode). */
export function productoMapDesdeRecetas(recetas: Receta[]): ProductoMap[] {
  const out: ProductoMap[] = [];
  for (const r of recetas) {
    const v = versionVigente(r);
    for (const c of v?.componentes ?? []) {
      const m = INS_A_CDP[c.insumoCod.trim().toLowerCase()];
      if (!m) continue;
      out.push({ codigoCdp: m.cdp, insumoNombre: m.nombre, skuVenta: r.skuTango, skuNombre: r.descripcion, factor: c.cant, modo: "bom" });
    }
  }
  return out;
}

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
    grupo: r.grupo,
    orden: r.orden,
    canales: r.canales,
    version: v?.version ?? 0,
    fecha: v?.fecha ?? "",
    nVersiones: r.versiones.length,
    componentes: comps,
    costoNeto,
    costoConImp,
    nFaltantes: comps.filter((c) => c.falta).length,
    sinReceta: !v || v.componentes.length === 0,
  };
}
