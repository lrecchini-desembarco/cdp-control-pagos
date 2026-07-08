// Costos de ELABORACIÓN en el CDP (sin IVA), por unidad de insumo.
// Fuente: "MRT M&G Costos y Precios - Julio 2026 1Q.xlsx", hoja INS_L1,
// columna "Precio UM p/ costo". Costo unitario = precio del bulto / factor de la caja.
//
// Se usan para valorizar el "$ en riesgo" (lo pedido al CDP que no se vendió).
// NO es el precio de transferencia al local (esa es "LISTA PRECIOS"), es el
// costo de producirlo. Al sumar más códigos de Raven, agregar acá su costo.

export const COSTOS_VIGENCIA = "Julio 2026";
// Vigencia estructurada, para avisar en pantalla cuando los costos quedaron viejos.
const VIGENCIA_ANIO = 2026;
const VIGENCIA_MES = 7; // julio
/** Meses transcurridos desde la vigencia de los costos (0 = al día, >0 = vencidos). */
export const mesesDesactualizado = (): number => {
  const h = new Date();
  return Math.max(0, (h.getFullYear() - VIGENCIA_ANIO) * 12 + (h.getMonth() + 1 - VIGENCIA_MES));
};

// code (Raven / CDP) -> costo de elaborar 1 unidad, sin IVA.
export const COSTO_CDP: Record<string, number> = {
  "050027": 37450 / 25,    // Bolas Blend 100g  — bolsa x25 = $1.498/u
  "083009": 49565 / 60,    // Medallón Tuki 80g — caja x60 = $826,08/u
  "083041": 39858 / 72,    // Medallón Tuki 55g — caja x72 = $553,58/u
};

/** Costo de elaborar 1 unidad del insumo en el CDP (0 si no hay costo cargado). */
export const costoInsumo = (code: string): number => COSTO_CDP[code] ?? 0;

/** ¿Tenemos costo cargado para este insumo? (para avisar cuando falta). */
export const tieneCosto = (code: string): boolean => code in COSTO_CDP;
