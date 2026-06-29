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
  // Sucursal nueva que Raven ya reporta pero todavía sin código canónico:
  // está activa y vendiendo, pero no entra al cruce -> punto ciego (genera alerta).
  { ravenCode: "2011", canonico: "", nombre: "Nordelta", brand: "tasty", activa: true },
  { ravenCode: "3001", canonico: "MG-NUN", nombre: "Núñez", brand: "mila", activa: true },
];

export const PRODUCTO_MAP: ProductoMap[] = [
  { codigoCdp: "050027", insumoNombre: "Bolas Blend 100g", skuVenta: "210010", skuNombre: "Empanada de carne", factor: 1, modo: "directo" },
  { codigoCdp: "040022", insumoNombre: "Medallón Tuki 80g", skuVenta: "138002", skuNombre: "Burger clásica de carne", factor: 1, modo: "bom" },
  { codigoCdp: "040022", insumoNombre: "Medallón Tuki 80g", skuVenta: "138005", skuNombre: "Burger doble cuarto c/ queso", factor: 2, modo: "bom" },
  { codigoCdp: "080002", insumoNombre: "Panceta feteada", skuVenta: "138003", skuNombre: "Burger bacon de carne", factor: 2, modo: "bom" },
  { codigoCdp: "150001", insumoNombre: "Milanesa de carne", skuVenta: "150001", skuNombre: "Milanesa clásica de carne", factor: 1, modo: "directo" },
];

/** Insumos que el CDP entrega. Si un insumo no tiene regla en PRODUCTO_MAP,
 *  sus pedidos no se pueden contrastar contra ventas (genera alerta). */
export const PRODUCTS: { code: string; name: string; unit: string; brand: BrandId }[] = [
  { code: "050027", name: "Bolas Blend 100g", unit: "un", brand: "desembarco" },
  { code: "040022", name: "Medallón Tuki 80g", unit: "un", brand: "tasty" },
  { code: "080002", name: "Panceta feteada", unit: "g", brand: "tasty" },
  { code: "150001", name: "Milanesa de carne", unit: "un", brand: "mila" },
  // Insumo que el CDP despacha pero todavía sin receta cargada -> punto ciego.
  { code: "060015", name: "Pan brioche", unit: "un", brand: "tasty" },
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

/**
 * Genera el cruce mock. La venta equivalente se DERIVA de ventas por SKU x factor
 * (mismo modelo que con datos reales), así el desglose del detalle cuadra con el total.
 * El pedido al CDP se genera con un desvío sobre esa venta equivalente.
 */
export function buildCruce(): CruceRow[] {
  const rows: CruceRow[] = [];
  const dates = recentDates(7);
  let seed = 7;
  for (const p of PRODUCTS) {
    const reglas = PRODUCTO_MAP.filter((m) => m.codigoCdp === p.code);
    if (reglas.length === 0) continue;
    // Solo sucursales mapeadas: una sin código canónico no puede cruzarse
    // (queda como punto ciego y se reporta aparte en Alertas).
    const branches = SUCURSALES.filter((s) => s.brand === p.brand && s.activa && s.canonico);
    for (const s of branches) {
      for (const fecha of dates) {
        const r = rng(seed++);
        // ventas mock por SKO de cada regla -> componentes
        const componentes = reglas.map((m) => {
          const vendidas = 40 + Math.floor(r() * 320);
          return {
            sku: m.skuVenta,
            nombre: m.skuNombre,
            vendidas,
            factor: m.factor,
            subtotal: vendidas * m.factor,
          };
        });
        const ventaEquiv = componentes.reduce((a, c) => a + c.subtotal, 0);
        // pedido = venta equivalente +/- desvío (sobre o sub-pedido)
        const drift = (r() - 0.5) * 0.5; // -25%..+25%
        const pedidoCdp = Math.max(1, Math.round(ventaEquiv * (1 + drift)));
        rows.push({
          fecha,
          brand: p.brand,
          sucursal: s.nombre,
          codigoCdp: p.code,
          producto: p.name,
          pedidoCdp,
          ventaEquiv,
          unidad: p.unit,
          componentes,
        });
      }
    }
  }
  return rows;
}
