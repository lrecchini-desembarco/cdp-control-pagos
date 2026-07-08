// Maestro de INSUMOS (base del módulo Costos). Cada insumo tiene su costo por
// unidad de receta (neto) y las tasas de impuesto para componer el precio final.
// Sembrado con la hoja INS_L1 del Excel "MRT M&G Costos y Precios"; editable y
// persistido en KV desde la pantalla. Es la base sobre la que se arman las recetas.

export interface Insumo {
  cod: string;          // Cód. interno — clave única
  codTango?: string | null;
  donde: string;        // "Ambas" | "DS" | "Mr. Tasty" — qué marca lo usa
  descripcion: string;  // descripción para receta
  marca: string;
  proveedor: string;
  presentacion: string; // "Caja x 60 un.", "x kg"…
  precioBulto: number;  // precio del bulto/caja
  factor: number;       // unidades por bulto (factor de conversión UMC)
  precioUnidad: number; // precio por unidad de receta = precioBulto / factor (neto, sin imp.)
  ivaPct: number;       // 0 | 10.5 | 21
  iiPct: number;        // impuestos internos (% libre)
  actualizado?: string | null; // ISO YYYY-MM-DD
  estado?: string;
  obs?: string;
}

export const IVA_OPCIONES = [0, 10.5, 21] as const;
export const DONDE_OPCIONES = ["Ambas", "DS", "Mr. Tasty"] as const;

/** Precio final del insumo con impuestos, según la composición del documento:
 *  sin II:  precio × (1 + IVA)
 *  con II:  precio × (1 + IVA) + precio × II   */
export function precioConImpuestos(ins: Pick<Insumo, "precioUnidad" | "ivaPct" | "iiPct">): number {
  const base = ins.precioUnidad || 0;
  const conIva = base * (1 + (ins.ivaPct || 0) / 100);
  const ii = ins.iiPct ? base * (ins.iiPct / 100) : 0;
  return conIva + ii;
}

/** Antigüedad del costo en días (para avisar cuando quedó viejo). null si no hay fecha. */
export function antiguedadDias(actualizado?: string | null): number | null {
  if (!actualizado) return null;
  const d = new Date(actualizado + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** Recalcula el precio por unidad a partir del bulto y el factor. */
export const precioUnidadDe = (precioBulto: number, factor: number): number =>
  factor > 0 ? precioBulto / factor : 0;
