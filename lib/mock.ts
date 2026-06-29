import type { Sucursal, ProductoMap, CruceRow, BrandId } from "./types";

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
  { ravenCode: "3001", canonico: "MG-NUN", nombre: "Núñez", brand: "mila", activa: true },
];

export const PRODUCTO_MAP: ProductoMap[] = [
  { codigoCdp: "050027", insumoNombre: "Bolas Blend 100g", skuVenta: "210010", skuNombre: "Empanada de carne", factor: 1, modo: "directo" },
  { codigoCdp: "040022", insumoNombre: "Medallón Tuki 80g", skuVenta: "138002", skuNombre: "Burger clásica de carne", factor: 1, modo: "bom" },
  { codigoCdp: "040022", insumoNombre: "Medallón Tuki 80g", skuVenta: "138005", skuNombre: "Burger doble cuarto c/ queso", factor: 2, modo: "bom" },
  { codigoCdp: "080002", insumoNombre: "Panceta feteada", skuVenta: "138003", skuNombre: "Burger bacon de carne", factor: 2, modo: "bom" },
  { codigoCdp: "150001", insumoNombre: "Milanesa de carne", skuVenta: "150001", skuNombre: "Milanesa clásica de carne", factor: 1, modo: "directo" },
];

const PRODUCTS: { code: string; name: string; unit: string; brand: BrandId }[] = [
  { code: "050027", name: "Bolas Blend 100g", unit: "un", brand: "desembarco" },
  { code: "040022", name: "Medallón Tuki 80g", unit: "un", brand: "tasty" },
  { code: "080002", name: "Panceta feteada", unit: "g", brand: "tasty" },
  { code: "150001", name: "Milanesa de carne", unit: "un", brand: "mila" },
];

// PRNG determinístico para mock estable entre renders
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

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

/** Genera el cruce mock: pedido al CDP vs venta equivalente, con desvíos variados */
export function buildCruce(): CruceRow[] {
  const rows: CruceRow[] = [];
  const dates = recentDates(7);
  let seed = 7;
  for (const p of PRODUCTS) {
    const branches = SUCURSALES.filter((s) => s.brand === p.brand && s.activa);
    for (const s of branches) {
      for (const fecha of dates) {
        const r = rng(seed++);
        const base = 50 + Math.floor(r() * 400);
        const pedido = base + Math.floor(r() * 50);
        // desvío: a veces sub-pedido, a veces sobre-pedido
        const drift = (r() - 0.5) * 0.5; // -25%..+25%
        const ventaEquiv = Math.max(0, Math.round(pedido * (1 - drift)));
        rows.push({
          fecha,
          brand: p.brand,
          sucursal: s.nombre,
          codigoCdp: p.code,
          producto: p.name,
          pedidoCdp: pedido,
          ventaEquiv,
          unidad: p.unit,
        });
      }
    }
  }
  return rows;
}
