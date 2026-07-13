// Resumen de ventas por mozo (vista dbo.vw_VentasPorMozo de Tango Restô).
// El nombre del mozo sale de CTA_MOZO.NOMBRE; ojo que muchos locales usan nombres
// genéricos ("CAJA", "MOZO2") -> el ranking refleja eso tal cual. Ver getMozos.
import type { VentaMozo } from "./sources/types";

export interface MozoRank { mozo: string; importe: number; tickets: number; ticketProm: number; comensales: number; ventaPorComensal: number; locales: number }
export interface MozoLocal { mozo: string; idSucursal: number; local: string; importe: number; tickets: number; ticketProm: number; comensales: number; ventaPorComensal: number }
export interface ResumenMozos {
  totalImporte: number;
  totalTickets: number;
  totalComensales: number;
  ticketProm: number;
  ventaPorComensal: number;    // importe / comensales (solo donde hay cubiertos)
  desde: string;
  hasta: string;
  mozos: number;               // nombres de mozo distintos
  locales: number;
  conNombres: boolean;         // hay nombres de sucursal (vw_Sucursales)
  porMozo: MozoRank[];         // ranking por mozo (agregado entre locales)
  detalle: MozoLocal[];        // mozo × local (granular)
}

export function resumirMozos(rows: VentaMozo[], desde: string, hasta: string, nombres: Record<number, string> = {}): ResumenMozos {
  const porMozoMap = new Map<string, { importe: number; tickets: number; comensales: number; locales: Set<number> }>();
  const detMap = new Map<string, { mozo: string; idSucursal: number; importe: number; tickets: number; comensales: number }>();
  const mozos = new Set<string>();
  const locales = new Set<number>();
  let totalImporte = 0, totalTickets = 0, totalComensales = 0;
  for (const r of rows) {
    totalImporte += r.importe; totalTickets += r.tickets; totalComensales += r.comensales;
    mozos.add(r.mozo); locales.add(r.idSucursal);
    const pm = porMozoMap.get(r.mozo) ?? { importe: 0, tickets: 0, comensales: 0, locales: new Set<number>() };
    pm.importe += r.importe; pm.tickets += r.tickets; pm.comensales += r.comensales; pm.locales.add(r.idSucursal); porMozoMap.set(r.mozo, pm);
    const k = `${r.idSucursal}|${r.mozo}`;
    const d = detMap.get(k) ?? { mozo: r.mozo, idSucursal: r.idSucursal, importe: 0, tickets: 0, comensales: 0 };
    d.importe += r.importe; d.tickets += r.tickets; d.comensales += r.comensales; detMap.set(k, d);
  }
  const porMozo = Array.from(porMozoMap.entries())
    .map(([mozo, v]) => ({ mozo, importe: v.importe, tickets: v.tickets, ticketProm: v.tickets ? v.importe / v.tickets : 0, comensales: v.comensales, ventaPorComensal: v.comensales ? v.importe / v.comensales : 0, locales: v.locales.size }))
    .sort((a, b) => b.importe - a.importe);
  const detalle = Array.from(detMap.values())
    .map((d) => ({ mozo: d.mozo, idSucursal: d.idSucursal, local: nombres[d.idSucursal] ?? `Local ${d.idSucursal}`, importe: d.importe, tickets: d.tickets, ticketProm: d.tickets ? d.importe / d.tickets : 0, comensales: d.comensales, ventaPorComensal: d.comensales ? d.importe / d.comensales : 0 }))
    .sort((a, b) => b.importe - a.importe);
  return {
    totalImporte, totalTickets, totalComensales,
    ticketProm: totalTickets ? totalImporte / totalTickets : 0,
    ventaPorComensal: totalComensales ? totalImporte / totalComensales : 0,
    desde, hasta, mozos: mozos.size, locales: locales.size, conNombres: Object.keys(nombres).length > 0,
    porMozo, detalle,
  };
}
