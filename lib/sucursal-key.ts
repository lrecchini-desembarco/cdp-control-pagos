// Normalización de nombres de sucursal para reconciliar fuentes que traen el
// NOMBRE (no un ID): Tango (ventas/precios), Raven (pedidos) y los CSV de
// remitos/compras. Centralizado acá para que el cruce, Remitos y Compras usen
// EXACTAMENTE la misma lógica (antes cada uno tenía su propio `norm` y divergían).

// Base del nombre: sin acentos/símbolos, minúsculas, espacios colapsados. Además
// unifica el prefijo de Mr Tasty: Raven a veces nombra "Mr Tasty X" y Tango
// "Mrt X" -> ambos quedan "mrt x". NO saca el "mrt" (eso lo decide la clave).
export const baseSuc = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^mr tasty /, "mrt ");

// Construye la clave de reconciliación. Por defecto saca el prefijo "mrt " (así
// el pedido/CSV "Caballito" cruza con la venta Tango "Mrt Caballito"). PERO si en
// los datos existe además un local El Desembarco con el MISMO nombre base (ej.
// "San Miguel" y "Mrt San Miguel"), NO lo saca: dos locales de marcas distintas
// nunca terminan fusionados en la misma fila.
export function armarClaveSuc(nombres: string[]): (s: string) => string {
  const bases = new Set(nombres.map(baseSuc));
  const ambiguas = new Set<string>(); // bases con gemelo El Desembarco
  Array.from(bases).forEach((b) => {
    if (b.startsWith("mrt ") && bases.has(b.slice(4))) ambiguas.add(b.slice(4));
  });
  return (s: string) => {
    const b = baseSuc(s);
    if (b.startsWith("mrt ")) {
      const sinMrt = b.slice(4);
      return ambiguas.has(sinMrt) ? b : sinMrt; // ambigua -> conserva "mrt X" aparte
    }
    return b;
  };
}
