import type { Sucursal, ProductoMap } from "./types";

/**
 * Catálogo / configuración del control. NO es mock: son las equivalencias
 * reales que hacen posible el cruce (sucursales de Raven y recetas de producto).
 * Se editan desde la pantalla Mapeos; acá vive el valor inicial.
 */

export const SUCURSALES: Sucursal[] = [
  { ravenCode: "1007", canonico: "DS-FLO", nombre: "Flores", brand: "desembarco", activa: true },
  { ravenCode: "1010", canonico: "DS-COL", nombre: "Colegiales", brand: "desembarco", activa: true },
  { ravenCode: "1014", canonico: "DS-MOR", nombre: "Morón", brand: "desembarco", activa: true },
  { ravenCode: "1019", canonico: "DS-PAT", nombre: "P. Patricios", brand: "desembarco", activa: true },
  { ravenCode: "1020", canonico: "DS-URQ", nombre: "Villa Urquiza", brand: "desembarco", activa: true },
  { ravenCode: "1022", canonico: "DS-RAM", nombre: "Ramos Mejía", brand: "desembarco", activa: true },
  { ravenCode: "1042", canonico: "DS-CAS", nombre: "Castelar", brand: "desembarco", activa: false },
  { ravenCode: "2003", canonico: "MT-PIL", nombre: "Pilar", brand: "tasty", activa: true },
  { ravenCode: "2008", canonico: "MT-CAB", nombre: "Caballito", brand: "tasty", activa: true },
  // Sucursal nueva que Raven ya reporta pero todavía sin código canónico:
  // está activa y vendiendo, pero no entra al cruce -> punto ciego (genera alerta).
  { ravenCode: "2011", canonico: "", nombre: "Nordelta", brand: "tasty", activa: true },
  { ravenCode: "3001", canonico: "MG-NUN", nombre: "Núñez", brand: "mila", activa: true },
];

// Recetas (BOM) por SKU de venta → insumo del CDP y factor. Solo se listan los
// insumos que el CDP produce y Raven trackea (Medallón Tuki 80g/55g, Bolas Blend);
// el resto de la receta (pan, cheddar, cebolla, packaging) no entra al cruce.
// Fuente: hoja R_MT del Excel "MRT M&G Costos y Precios - Julio 2026 1Q" +
// altas confirmadas por el encargado para SKU nuevos que el Excel no tenía
// (balde mundialista, cuarto+papas, doble cheese, bandeja slice 55g).
export const PRODUCTO_MAP: ProductoMap[] = [
  { codigoCdp: "050027", insumoNombre: "Bolas Blend 100g", skuVenta: "130016", skuNombre: "DOBLE CHEESE", factor: 2, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138001", skuNombre: "BURGER CUARTO CON QUESO DE CARNE", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138002", skuNombre: "BURGER CLÁSICA DE CARNE", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138003", skuNombre: "BURGER BACON DE CARNE", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138004", skuNombre: "BURGER QUESO DE CARNE (sin papas)", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138005", skuNombre: "BURGER DOBLE CUARTO CON QUESO DE CARNE", factor: 2, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138016", skuNombre: "BURGER CUARTO CON QUESO DE CARNE + PAPAS", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138017", skuNombre: "BURGER CLÁSICA DE CARNE + PAPAS", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138018", skuNombre: "BURGER BACON DE CARNE + PAPAS", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138019", skuNombre: "BURGER QUESO DE CARNE + PAPAS", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138020", skuNombre: "BURGER DOBLE CUARTO CON QUESO + PAPAS", factor: 2, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138025", skuNombre: "BURGER TRIPLE CUARTO CON QUESO", factor: 3, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138026", skuNombre: "BURGER DOBLE BACON DE CARNE + PAPAS", factor: 2, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138027", skuNombre: "BURGER TRIPLE BACON DE CARNE + PAPAS", factor: 3, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138040", skuNombre: "BURGER DOBLE BACON DE CARNE", factor: 2, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138042", skuNombre: "BURGER TRIPLE CUARTO CON QUESO", factor: 3, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138047", skuNombre: "BURGER TRIPLE BACON DE CARNE", factor: 3, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "138103", skuNombre: "BURGER CUARTO DE CARNE + PAPAS", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "198006", skuNombre: "ADICIONAL MEDALLÓN CARNE 80 g", factor: 1, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "508019", skuNombre: "2 CUARTO CON QUESO + BANDEJA CHICA", factor: 2, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "508041", skuNombre: "BALDE MIXTO TASTY MILA DE CARNE", factor: 2, modo: "bom" },
  { codigoCdp: "083041", insumoNombre: "Medallón Tuki 55g", skuVenta: "508043", skuNombre: "COMBO CHEESE BURGER (55 g) + PAPAS + BEB", factor: 1, modo: "bom" },
  { codigoCdp: "083041", insumoNombre: "Medallón Tuki 55g", skuVenta: "508044", skuNombre: "COMBO CHEESE BACON (55 g) + PAPAS + BEB", factor: 1, modo: "bom" },
  { codigoCdp: "083041", insumoNombre: "Medallón Tuki 55g", skuVenta: "508045", skuNombre: "COMBO CHEESE BACON DOBLE (55 g) + PAPAS", factor: 2, modo: "bom" },
  { codigoCdp: "083041", insumoNombre: "Medallón Tuki 55g", skuVenta: "508046", skuNombre: "COMBO CHEESE BACON TRIPLE (55 g) + PAPAS", factor: 3, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "508047", skuNombre: "BALDE A LA BOLSA", factor: 4, modo: "bom" },
  { codigoCdp: "083009", insumoNombre: "Medallón Tuki 80g", skuVenta: "508063", skuNombre: "BALDE MUNDIALISTA (ed. limitada)", factor: 4, modo: "bom" },
  { codigoCdp: "083041", insumoNombre: "Medallón Tuki 55g", skuVenta: "508065", skuNombre: "BANDEJA SLICE 2 BACON DOBLE 55 g", factor: 4, modo: "bom" },
];

/** Insumos que el CDP entrega. Si un insumo no tiene regla en PRODUCTO_MAP,
 *  sus pedidos no se pueden contrastar contra ventas (genera alerta). */
// Insumos del CDP con su CÓDIGO REAL de Raven (confirmado con Raven, jul-2026).
// Panceta / Milanesa / Pan brioche quedan pendientes del código real (dan 404 hoy).
export const PRODUCTS: { code: string; name: string; unit: string; brand: import("./types").BrandId }[] = [
  { code: "050027", name: "Bolas Blend 100g", unit: "un", brand: "desembarco" },
  { code: "083009", name: "Medallón Tuki 80g", unit: "un", brand: "tasty" },
  { code: "083041", name: "Medallón Tuki 55g", unit: "un", brand: "tasty" },
];

/** Devuelve las últimas n fechas (incluida hoy) en formato ISO AAAA-MM-DD. */
export function recentDates(n: number): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
  }
  return out;
}

/** Mapa rápido ravenCode -> sucursal, para traducir lo que devuelve Raven. */
export const sucursalPorRaven = (ravenCode: string) =>
  SUCURSALES.find((s) => s.ravenCode === ravenCode);

/** Unidad de un insumo del CDP (un / g …). */
export const unidadDe = (code: string) =>
  PRODUCTS.find((p) => p.code === code)?.unit ?? "un";

/** Nombre legible de un insumo del CDP. */
export const nombreInsumo = (code: string) =>
  PRODUCTS.find((p) => p.code === code)?.name ??
  PRODUCTO_MAP.find((m) => m.codigoCdp === code)?.insumoNombre ??
  code;

/** Marca a la que pertenece un insumo del CDP. */
export const brandDeInsumo = (code: string) =>
  PRODUCTS.find((p) => p.code === code)?.brand ??
  SUCURSALES[0].brand;
