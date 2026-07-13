// Resumen de ticket promedio y ritmo por hora (vista dbo.vw_VentasPorHora de Tango).
// Hoy a nivel GRUPO (la vista trae ID_SUCURSAL sin nombre). Ver lib/sources/tango.getVentasHoras.
import type { VentaHora } from "./sources/types";

export interface HoraCelda { hora: number; importe: number; tickets: number; ticketProm: number }
export interface HoraDiaSerie { fecha: string; importe: number; tickets: number }
export interface ResumenHoras {
  totalImporte: number;
  totalTickets: number;
  ticketProm: number;
  desde: string;
  hasta: string;
  locales: number;
  porHora: HoraCelda[];       // 0..23, siempre las 24 (para el heatmap)
  porDia: HoraDiaSerie[];
  horaPico: number;           // hora con más importe
}

export function resumirHoras(rows: VentaHora[], desde: string, hasta: string): ResumenHoras {
  const horaImp = new Array(24).fill(0);
  const horaTk = new Array(24).fill(0);
  const porDiaMap = new Map<string, { importe: number; tickets: number }>();
  const locales = new Set<number>();
  let totalImporte = 0, totalTickets = 0;
  for (const r of rows) {
    const h = r.hora >= 0 && r.hora < 24 ? r.hora : 0;
    horaImp[h] += r.importe; horaTk[h] += r.tickets;
    totalImporte += r.importe; totalTickets += r.tickets;
    locales.add(r.idSucursal);
    const d = porDiaMap.get(r.fecha) ?? { importe: 0, tickets: 0 };
    d.importe += r.importe; d.tickets += r.tickets; porDiaMap.set(r.fecha, d);
  }
  const porHora: HoraCelda[] = horaImp.map((imp, hora) => ({ hora, importe: imp, tickets: horaTk[hora], ticketProm: horaTk[hora] ? imp / horaTk[hora] : 0 }));
  const porDia = Array.from(porDiaMap.entries()).map(([fecha, v]) => ({ fecha, ...v })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  let horaPico = 0, max = -1;
  for (const c of porHora) if (c.importe > max) { max = c.importe; horaPico = c.hora; }
  return { totalImporte, totalTickets, ticketProm: totalTickets ? totalImporte / totalTickets : 0, desde, hasta, locales: locales.size, porHora, porDia, horaPico };
}
