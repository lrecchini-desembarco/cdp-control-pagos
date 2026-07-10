import { getSources, getPreciosSource } from "./sources";
import { brandDeSucursal } from "./ventas";
import { recentDates } from "./catalogo";
import type { RangoQuery } from "./sources/types";

/**
 * "Actividad de ventas" — dos lecturas de salud, 100% con datos reales de Tango:
 *   1) Ranking de locales + FRESCURA: volumen por local y hace cuánto que no vende
 *      (detecta locales "sin movimiento", ej. el caso Mrt San Miguel).
 *   2) Productos DORMIDOS: SKU×local que tienen precio (o sea, alguna vez vendieron)
 *      pero hace rato que no se venden -> posible quiebre o candidato a baja.
 *
 * Nota de diseño: la referencia de "hoy" NO es el reloj, es la FECHA MÁS NUEVA del
 * propio dato. Así, si el push viene con un día de atraso, no marca todo como viejo:
 * mide la frescura de cada local RELATIVA al resto (que es lo que importa).
 */

// Diferencia en días entre dos fechas ISO (b - a). Fechas YYYY-MM-DD => UTC.
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Ventana por defecto para el ranking (últimos 30 días). */
export function rangoActividad(): RangoQuery {
  const f = recentDates(30);
  return { desde: f[f.length - 1], hasta: f[0] };
}

export type EstadoLocal = "al-dia" | "atencion" | "sin-movimiento";

export interface LocalActividad {
  sucursal: string;
  marca: string;
  unidades: number;      // unidades vendidas en la ventana
  ultimaVenta: string;   // ISO de la última venta registrada en la ventana
  diasDesde: number;     // días desde la última venta, relativo a la fecha más nueva del set
  participacion: number; // % de las unidades totales
  estado: EstadoLocal;
}

export interface RankingLocales {
  refFecha: string;      // fecha más nueva del set (referencia de "hoy")
  ventana: RangoQuery;
  locales: LocalActividad[];
  totalUnidades: number;
  sinMovimiento: number; // cuántos locales están "sin movimiento"
}

function estadoDe(diasDesde: number): EstadoLocal {
  if (diasDesde >= 3) return "sin-movimiento";
  if (diasDesde >= 2) return "atencion";
  return "al-dia";
}

export async function getRankingLocales(q: RangoQuery = rangoActividad()): Promise<RankingLocales> {
  const { ventas } = getSources();
  const data = await ventas.getVentas(q);

  const porLocal = new Map<string, { unidades: number; ultima: string }>();
  let refFecha = "";
  for (const v of data) {
    if (v.fecha > refFecha) refFecha = v.fecha;
    const cur = porLocal.get(v.sucursalCanonico) ?? { unidades: 0, ultima: "" };
    cur.unidades += v.unidades;
    if (v.fecha > cur.ultima) cur.ultima = v.fecha;
    porLocal.set(v.sucursalCanonico, cur);
  }

  const totalUnidades = Array.from(porLocal.values()).reduce((s, x) => s + x.unidades, 0);
  const div = totalUnidades || 1;

  const locales: LocalActividad[] = Array.from(porLocal, ([sucursal, x]) => {
    const diasDesde = x.ultima ? diasEntre(x.ultima, refFecha) : 999;
    return {
      sucursal,
      marca: brandDeSucursal(sucursal),
      unidades: x.unidades,
      ultimaVenta: x.ultima,
      diasDesde,
      participacion: x.unidades / div,
      estado: estadoDe(diasDesde),
    };
  }).sort((a, b) => b.unidades - a.unidades);

  return {
    refFecha,
    ventana: q,
    locales,
    totalUnidades,
    sinMovimiento: locales.filter((l) => l.estado === "sin-movimiento").length,
  };
}

export interface ProductoDormido {
  sku: string;
  nombre: string;
  sucursal: string;
  marca: string;
  precio: number;
  ultimaVenta: string; // ISO (la venta que fijó el precio efectivo)
  dias: number;        // días dormido, relativo a la venta más reciente del set
}

export interface Dormidos {
  refFecha: string;
  umbralDias: number;
  items: ProductoDormido[];
  totalPares: number;  // total de pares SKU×local con precio (universo)
}

/**
 * Productos dormidos: pares SKU×local cuya última venta (precios.actualizado) es
 * más vieja que `umbralDias`. Se mide contra la venta más reciente del set.
 */
export async function getProductosDormidos(umbralDias = 21): Promise<Dormidos> {
  const precios = await getPreciosSource().getPrecios();

  let refFecha = "";
  for (const p of precios) if (p.actualizado && p.actualizado > refFecha) refFecha = p.actualizado;

  const items: ProductoDormido[] = [];
  for (const p of precios) {
    if (!p.actualizado) continue;
    const dias = diasEntre(p.actualizado, refFecha);
    if (dias >= umbralDias) {
      items.push({
        sku: p.sku,
        nombre: p.nombre || p.sku,
        sucursal: p.sucursal,
        marca: brandDeSucursal(p.sucursal),
        precio: p.precio,
        ultimaVenta: p.actualizado,
        dias,
      });
    }
  }
  items.sort((a, b) => b.dias - a.dias);

  return { refFecha, umbralDias, items, totalPares: precios.length };
}
