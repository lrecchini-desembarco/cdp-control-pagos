import { margenDe, type Lista } from "./listas";

// Rentabilidad = margen unitario × volumen REAL vendido (Tango). Es lo que ninguna
// planilla puede: cruzar el margen de cada producto con lo que de verdad se vendió,
// para ver quién aporta y quién resta plata. Más un simulador de promo que proyecta
// el margen total a un precio con descuento (opcionalmente con cambio de volumen).

export interface FilaRentabilidad {
  skuTango: string;
  descripcion: string;
  precioVenta: number;
  costo: number;
  recetaFalta: boolean;
  unidades: number;
  margenUnitario: number;
  margenTotal: number;   // margenUnitario × unidades
  facturacion: number;   // precioVenta × unidades
  pctMargen: number;     // participación en el margen total (se completa afuera)
}

export interface SimResultado {
  precioPromo: number;
  margenUnitarioReg: number;
  margenUnitarioPromo: number;
  margenTotalActual: number;
  margenTotalProy: number;
  delta: number;
  unidadesProy: number;
}

/** Proyecta el margen total al aplicar un descuento y un cambio de volumen (uplift). */
export function simularPromo(
  precioRegular: number,
  costo: number,
  unidades: number,
  lista: Pick<Lista, "regaliasPct" | "publicidadPct">,
  descPct: number,
  upliftPct: number
): SimResultado {
  const mReg = margenDe("", "", precioRegular, costo, lista);
  const precioPromo = Math.round(precioRegular * (1 - descPct));
  const mPromo = margenDe("", "", precioPromo, costo, lista);
  const unidadesProy = Math.round(unidades * (1 + upliftPct));
  const margenTotalActual = mReg.margen * unidades;
  const margenTotalProy = mPromo.margen * unidadesProy;
  return {
    precioPromo,
    margenUnitarioReg: mReg.margen,
    margenUnitarioPromo: mPromo.margen,
    margenTotalActual,
    margenTotalProy,
    delta: margenTotalProy - margenTotalActual,
    unidadesProy,
  };
}
