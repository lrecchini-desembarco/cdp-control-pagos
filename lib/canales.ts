// Canales de apps (delivery) y margen por canal. Sobre el precio de la lista de
// apps + el costo de receta, se descuentan IIBB, regalías y el costo del canal
// (comisión + pago online + envíos + publicidad). Fórmulas validadas contra la
// hoja MTA_L1 del Excel:
//   IIBB      = precio neto × IIBB%            (neto = precio / 1,21)
//   Regalías  = precio × regalías%             (apps: sin ×1,21, distinto de salón)
//   Comisión  = precio × comisión% × 1,21      (con IVA)
//   Margen $  = precio − costo − IIBB − regalías − (comisión + pago + envíos + publi)

const IVA = 1.21;

export interface Canal {
  id: string;
  nombre: string;
  comisionPct: number;
  pagoOnlinePct: number;
  enviosPct: number;
  publicidadPct: number;
}

// Plataformas del documento, con comisión target aproximada (editable en la app).
export const CANALES_DEFAULT: Canal[] = [
  { id: "peya", nombre: "PedidosYa", comisionPct: 27, pagoOnlinePct: 0, enviosPct: 0, publicidadPct: 0 },
  { id: "rappi", nombre: "Rappi", comisionPct: 27, pagoOnlinePct: 0, enviosPct: 0, publicidadPct: 0 },
  { id: "rappi-turbo", nombre: "Rappi Turbo", comisionPct: 30, pagoOnlinePct: 0, enviosPct: 0, publicidadPct: 0 },
  { id: "meli", nombre: "Mercado Libre", comisionPct: 25, pagoOnlinePct: 0, enviosPct: 0, publicidadPct: 0 },
  { id: "uber", nombre: "Uber Eats", comisionPct: 28, pagoOnlinePct: 0, enviosPct: 0, publicidadPct: 0 },
];

export interface MargenApps {
  skuTango: string;
  descripcion: string;
  precioApps: number;
  precioSalon: number; // referencia (markup apps vs salón)
  costo: number;
  recetaFalta: boolean;
  cmvPct: number;
  iibb: number;
  regalias: number;
  costoCanal: number;  // comisión + pago + envíos + publicidad
  margen: number;
  margenPct: number;
  unidades: number;
}

export function margenApps(
  skuTango: string,
  descripcion: string,
  precioApps: number,
  precioSalon: number,
  costo: number,
  params: { regaliasPct: number; iibbPct: number },
  canal: Canal,
  unidades = 0
): MargenApps {
  const neto = precioApps / IVA;
  const iibb = neto * (params.iibbPct / 100);
  const regalias = precioApps * (params.regaliasPct / 100);
  const costoCanal =
    precioApps * ((canal.comisionPct + canal.pagoOnlinePct + canal.enviosPct + canal.publicidadPct) / 100) * IVA;
  const margen = precioApps - costo - iibb - regalias - costoCanal;
  return {
    skuTango, descripcion, precioApps, precioSalon, costo,
    recetaFalta: costo <= 0,
    cmvPct: precioApps ? costo / precioApps : 0,
    iibb, regalias, costoCanal,
    margen,
    margenPct: precioApps ? margen / precioApps : 0,
    unidades,
  };
}
