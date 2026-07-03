import { ravenPedidosSource } from "./sources/raven";
import { PRODUCTS, nombreInsumo } from "./catalogo";
import { esPropio } from "./propios";
import type { RangoQuery } from "./sources/types";

// Pedidos REALES al CDP por local (Raven público, sin token). Independiente del
// flag PEDIDOS_SOURCE: siempre pega a Raven real. Agrega por sucursal + insumo, con
// la clasificación propio/franquicia. No necesita la receta (es solo el lado pedido).

export interface PedidoLocal {
  sucursal: string;
  propio: boolean;
  porInsumo: Record<string, number>; // code -> unidades pedidas
  total: number;
}

export interface PedidosResumen {
  insumos: { code: string; nombre: string }[];
  locales: PedidoLocal[];
  totalPropios: number;
  totalNoPropios: number;
  total: number;
}

export async function getPedidosPorLocal(q: RangoQuery): Promise<PedidosResumen> {
  const pedidos = await ravenPedidosSource.getPedidos(q); // [{fecha, codigoCdp, sucursalCanonico(nombre), unidades}]
  const insumos = PRODUCTS.map((p) => ({ code: p.code, nombre: p.name || nombreInsumo(p.code) }));

  const map = new Map<string, PedidoLocal>();
  for (const p of pedidos) {
    const suc = p.sucursalCanonico;
    if (!suc) continue;
    let e = map.get(suc);
    if (!e) {
      e = { sucursal: suc, propio: esPropio(suc), porInsumo: {}, total: 0 };
      map.set(suc, e);
    }
    e.porInsumo[p.codigoCdp] = (e.porInsumo[p.codigoCdp] ?? 0) + p.unidades;
    e.total += p.unidades;
  }

  const locales = Array.from(map.values()).sort((a, b) => b.total - a.total);
  const totalPropios = locales.filter((l) => l.propio).reduce((s, l) => s + l.total, 0);
  const totalNoPropios = locales.filter((l) => !l.propio).reduce((s, l) => s + l.total, 0);
  return { insumos, locales, totalPropios, totalNoPropios, total: totalPropios + totalNoPropios };
}
