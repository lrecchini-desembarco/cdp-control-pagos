import { ravenPedidosSource } from "./sources/raven";
import { PRODUCTS, nombreInsumo } from "./catalogo";
import { getVentasPorSucursal } from "./ventas";
import { getOverrides, tipoEfectivo, operativoEfectivo, normLocal } from "./locales-config";
import type { RangoQuery } from "./sources/types";

// Comparativo CDP vs ventas POR LOCAL (datos reales, sin depender de la receta):
//   - Pedido al CDP: Raven público (Bolas + Tuki), por insumo.
//   - Venta del local: unidades vendidas en Tango.
//   - Clasificación propio/franquicia + operativo (con overrides manuales).

export interface LocalComparativo {
  sucursal: string;
  tipo: "propio" | "franquicia";
  operativo: boolean;
  porInsumo: Record<string, number>;
  pedido: number; // total unidades de insumo pedidas (Raven)
  venta: number;  // total unidades vendidas (Tango)
}

export interface ComparativoResumen {
  insumos: { code: string; nombre: string }[];
  locales: LocalComparativo[];
}

export async function getComparativoPorLocal(q: RangoQuery): Promise<ComparativoResumen> {
  const [pedidos, ventasSuc, ov] = await Promise.all([
    ravenPedidosSource.getPedidos(q),
    getVentasPorSucursal(q),
    getOverrides(),
  ]);
  const insumos = PRODUCTS.map((p) => ({ code: p.code, nombre: p.name || nombreInsumo(p.code) }));

  // key = nombre normalizado (sin sacar "mrt"); guardamos un nombre "lindo" para mostrar.
  const map = new Map<string, LocalComparativo & { _k: string }>();
  const get = (nombre: string) => {
    const k = normLocal(nombre);
    let e = map.get(k);
    if (!e) {
      e = { _k: k, sucursal: nombre, tipo: tipoEfectivo(nombre, ov), operativo: operativoEfectivo(nombre, ov), porInsumo: {}, pedido: 0, venta: 0 };
      map.set(k, e);
    }
    return e;
  };

  for (const p of pedidos) {
    if (!p.sucursalCanonico) continue;
    const e = get(p.sucursalCanonico);
    e.porInsumo[p.codigoCdp] = (e.porInsumo[p.codigoCdp] ?? 0) + p.unidades;
    e.pedido += p.unidades;
  }
  for (const v of ventasSuc) {
    if (!v.sucursal) continue;
    const e = get(v.sucursal);
    e.venta += v.unidades;
  }

  const locales = Array.from(map.values())
    .map(({ _k, ...rest }) => rest)
    .sort((a, b) => b.pedido - a.pedido || b.venta - a.venta);
  return { insumos, locales };
}
