// Resumen de cobros por medio de pago (vista dbo.vw_CobrosDiarios de Tango).
// Hoy a nivel GRUPO (la vista trae ID_SUCURSAL sin nombre; el desglose por local
// se enciende cuando Sistemas exponga el nombre). Ver lib/sources/tango.getCobros.
import type { CobroDia } from "./sources/types";

export interface CobroMedio { medio: string; importe: number; n: number; pct: number; familia: string }
export interface CobroFamilia { familia: string; importe: number; pct: number }
export interface CobroDiaSerie { fecha: string; importe: number }
export interface ResumenCobros {
  total: number;
  desde: string;
  hasta: string;
  medios: number;              // cantidad de medios distintos
  locales: number;             // cantidad de ID_SUCURSAL distintos
  porMedio: CobroMedio[];      // ordenado por importe desc
  porFamilia: CobroFamilia[];  // agrupado (efectivo / tarjetas / delivery / digital…)
  porDia: CobroDiaSerie[];     // serie temporal
}

// Familia del medio de pago, para el resumen grande. Orden importa (primero el más específico).
export function familiaDe(medio: string): string {
  const m = medio.toLowerCase();
  if (/efectivo|contado/.test(m)) return "Efectivo";
  if (/peya|pedidos\s*ya/.test(m)) return "PedidosYa";
  if (/rappi/.test(m)) return "Rappi";
  if (/mercado\s*pago|mercadopago|qr|nave/.test(m)) return "MercadoPago / QR";
  if (/visa|master|amex|cabal|maestro|tarjeta|debito|credito|morfy|naranja|posnet/.test(m)) return "Tarjetas";
  return "Otros";
}

const ORDEN_FAMILIA = ["Efectivo", "Tarjetas", "MercadoPago / QR", "PedidosYa", "Rappi", "Otros"];

export function resumirCobros(cobros: CobroDia[], desde: string, hasta: string): ResumenCobros {
  const porMedioMap = new Map<string, { importe: number; n: number }>();
  const porFamiliaMap = new Map<string, number>();
  const porDiaMap = new Map<string, number>();
  const locales = new Set<number>();
  let total = 0;
  for (const c of cobros) {
    total += c.importe;
    locales.add(c.idSucursal);
    const pm = porMedioMap.get(c.medioPago) ?? { importe: 0, n: 0 };
    pm.importe += c.importe; pm.n += 1; porMedioMap.set(c.medioPago, pm);
    const fam = familiaDe(c.medioPago);
    porFamiliaMap.set(fam, (porFamiliaMap.get(fam) ?? 0) + c.importe);
    porDiaMap.set(c.fecha, (porDiaMap.get(c.fecha) ?? 0) + c.importe);
  }
  const den = total || 1;
  const porMedio = Array.from(porMedioMap.entries())
    .map(([medio, v]) => ({ medio, importe: v.importe, n: v.n, pct: v.importe / den, familia: familiaDe(medio) }))
    .sort((a, b) => b.importe - a.importe);
  const porFamilia = Array.from(porFamiliaMap.entries())
    .map(([familia, importe]) => ({ familia, importe, pct: importe / den }))
    .sort((a, b) => (ORDEN_FAMILIA.indexOf(a.familia) - ORDEN_FAMILIA.indexOf(b.familia)));
  const porDia = Array.from(porDiaMap.entries())
    .map(([fecha, importe]) => ({ fecha, importe }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { total, desde, hasta, medios: porMedioMap.size, locales: locales.size, porMedio, porFamilia, porDia };
}
