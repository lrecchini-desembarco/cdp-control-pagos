// Resumen de anulados / devoluciones / invitaciones (vista dbo.vw_Anulados de Tango).
// Control anti-fuga: cuánta plata se anula/devuelve, sobre qué productos, en qué hora
// y local, y —donde Tango lo carga— quién anuló y quién autorizó. Ver getAnulados.
import type { Anulado } from "./sources/types";

export interface AnulTipo { tipo: string; importe: number; n: number; pct: number }
export interface AnulItem { clave: string; importe: number; n: number }         // producto / responsable / autoriza
export interface AnulLocal { idSucursal: number; local: string; importe: number; n: number }
export interface AnulHora { hora: number; importe: number; n: number }
export interface ResumenAnulados {
  total: number;
  totalN: number;
  totalCantidad: number;
  desde: string;
  hasta: string;
  locales: number;
  conNombres: boolean;
  porTipo: AnulTipo[];
  porProducto: AnulItem[];
  porLocal: AnulLocal[];
  porHora: AnulHora[];              // 0..23
  porResponsable: AnulItem[];      // quién anuló (rol/persona; "(sin dato)" incluido)
  porAutoriza: AnulItem[];         // quién autorizó (solo los cargados)
}

function topBy(map: Map<string, { importe: number; n: number }>): AnulItem[] {
  return Array.from(map.entries()).map(([clave, v]) => ({ clave, importe: v.importe, n: v.n })).sort((a, b) => b.importe - a.importe);
}

export function resumirAnulados(rows: Anulado[], desde: string, hasta: string, nombres: Record<number, string> = {}): ResumenAnulados {
  const tipoMap = new Map<string, { importe: number; n: number }>();
  const prodMap = new Map<string, { importe: number; n: number }>();
  const localMap = new Map<number, { importe: number; n: number }>();
  const respMap = new Map<string, { importe: number; n: number }>();
  const autMap = new Map<string, { importe: number; n: number }>();
  const horaImp = new Array(24).fill(0);
  const horaN = new Array(24).fill(0);
  const locales = new Set<number>();
  let total = 0, totalN = 0, totalCantidad = 0;
  const add = (m: Map<any, { importe: number; n: number }>, k: any, imp: number, n: number) => {
    const a = m.get(k) ?? { importe: 0, n: 0 }; a.importe += imp; a.n += n; m.set(k, a);
  };
  for (const r of rows) {
    total += r.importe; totalN += r.n; totalCantidad += r.cantidad;
    locales.add(r.idSucursal);
    add(tipoMap, r.tipo, r.importe, r.n);
    add(prodMap, r.producto, r.importe, r.n);
    add(localMap, r.idSucursal, r.importe, r.n);
    add(respMap, r.responsable || "(sin dato)", r.importe, r.n);
    if (r.autoriza) add(autMap, r.autoriza, r.importe, r.n);
    const h = r.hora >= 0 && r.hora < 24 ? r.hora : 0;
    horaImp[h] += r.importe; horaN[h] += r.n;
  }
  const den = total || 1;
  return {
    total, totalN, totalCantidad, desde, hasta, locales: locales.size, conNombres: Object.keys(nombres).length > 0,
    porTipo: Array.from(tipoMap.entries()).map(([tipo, v]) => ({ tipo, importe: v.importe, n: v.n, pct: v.importe / den })).sort((a, b) => b.importe - a.importe),
    porProducto: topBy(prodMap),
    porLocal: Array.from(localMap.entries()).map(([idSucursal, v]) => ({ idSucursal, local: nombres[idSucursal] ?? `Local ${idSucursal}`, importe: v.importe, n: v.n })).sort((a, b) => b.importe - a.importe),
    porHora: horaImp.map((imp, hora) => ({ hora, importe: imp, n: horaN[hora] })),
    porResponsable: topBy(respMap),
    porAutoriza: topBy(autMap),
  };
}
