// Costos de ELABORACIÓN en el CDP (sin IVA), por unidad de insumo.
// Fuente: "Ventas Junio CDP.xlsx" (hoja "Precios Junio 2026"), columna
// "Costo Por Receta sin IVA". Cuando la receta viene por caja de N unidades,
// el costo unitario = costo receta / N.
//
// Se usan para valorizar el "$ en riesgo" (lo pedido al CDP que no se vendió).
// NO es el precio de transferencia al local (esa es "LISTA PRECIOS"), es el
// costo de producirlo. Al sumar más códigos de Raven, agregar acá su costo.

export const COSTOS_VIGENCIA = "Junio 2026";

// code (Raven / CDP) -> costo de elaborar 1 unidad, sin IVA.
export const COSTO_CDP: Record<string, number> = {
  "050027": 949.69,        // Bolas Blend (1 unidad)
  "083009": 37858 / 60,    // Medallón Tuki 80g  — "Hamburguesa Tuki" caja x60 = $630,97/u
  "083041": 31234 / 72,    // Medallón Tuki 55g  — "Hamburguesa Tuki 55 grs" caja x72 = $433,81/u
};

/** Costo de elaborar 1 unidad del insumo en el CDP (0 si no hay costo cargado). */
export const costoInsumo = (code: string): number => COSTO_CDP[code] ?? 0;

/** ¿Tenemos costo cargado para este insumo? (para avisar cuando falta). */
export const tieneCosto = (code: string): boolean => code in COSTO_CDP;
