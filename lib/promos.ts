import { margenDe, type Lista } from "./listas";
import { margenApps, type Canal } from "./canales";

// Promociones (salón y apps). Una promo aplica un descuento (% o precio objetivo)
// a productos de una lista y muestra el CMV y el margen resultantes al precio de
// promo — reutilizando el mismo cálculo de margen del mostrador y de apps. En apps
// va atada a un canal (para descontar su comisión).

export interface PromoProducto {
  skuTango: string;
  precioPromo?: number; // precio objetivo; si falta, se usa descPct
  descPct?: number;     // descuento sobre el precio de lista (0..1)
}
export interface Promo {
  id: string;
  nombre: string;
  descripcion?: string;
  tipo: "salon" | "apps";
  listaId: string;
  marca: string;
  canal?: string;        // solo apps
  fechaInicio: string;
  fechaFin: string;
  pisoPct?: number;      // apps: piso de descuento sugerido
  aprobada: boolean;
  productos: PromoProducto[];
}

export interface PromoProductoCosteado {
  skuTango: string;
  descripcion: string;
  precioRegular: number;
  precioPromo: number;
  descPct: number;
  costo: number;
  recetaFalta: boolean;
  cmvRegular: number;
  cmvPromo: number;
  margenRegular: number;
  margenPromo: number;
  margenPromoPct: number;
}

/** Precio de promo efectivo: precio objetivo si está, si no precio de lista × (1 − desc). */
export function precioPromoDe(precioRegular: number, p: PromoProducto): number {
  if (p.precioPromo && p.precioPromo > 0) return p.precioPromo;
  if (p.descPct && p.descPct > 0) return Math.round(precioRegular * (1 - p.descPct));
  return precioRegular;
}

/** Cuesta un producto de la promo: margen regular vs margen de promo. */
export function costearPromoProducto(
  p: PromoProducto,
  descripcion: string,
  precioRegular: number,
  costo: number,
  lista: Lista,
  canal?: Canal
): PromoProductoCosteado {
  const precioPromo = precioPromoDe(precioRegular, p);
  const descPct = precioRegular ? 1 - precioPromo / precioRegular : 0;
  const mReg = canal
    ? margenApps(p.skuTango, descripcion, precioRegular, 0, costo, lista, canal)
    : margenDe(p.skuTango, descripcion, precioRegular, costo, lista);
  const mProm = canal
    ? margenApps(p.skuTango, descripcion, precioPromo, 0, costo, lista, canal)
    : margenDe(p.skuTango, descripcion, precioPromo, costo, lista);
  return {
    skuTango: p.skuTango,
    descripcion,
    precioRegular,
    precioPromo,
    descPct,
    costo,
    recetaFalta: costo <= 0,
    cmvRegular: mReg.cmvPct,
    cmvPromo: mProm.cmvPct,
    margenRegular: mReg.margen,
    margenPromo: mProm.margen,
    margenPromoPct: mProm.margenPct,
  };
}
