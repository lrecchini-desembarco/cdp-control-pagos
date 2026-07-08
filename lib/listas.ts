// Listas de precios (mostrador / salón) y cálculo de margen. Combina 3 fuentes
// reales: precio de lista (editable), costo de receta (módulo Recetas, en vivo) y
// unidades vendidas (Tango). Fórmulas validadas contra el Excel MTS_L1:
//   CMV %      = costo c/IVA / precio de venta
//   Regalías   = precio × tasa regalías × 1,21   (6% "con IVA")
//   Publicidad = precio × tasa publicidad × 1,21
//   Margen $   = precio − costo − regalías − publicidad
//   Margen %   = margen / precio

const IVA = 1.21;

export interface Lista {
  id: string;
  nombre: string;
  marca: string;
  tipo: "salon" | "mostrador" | "apps";
  regaliasPct: number;
  iibbPct: number;
  publicidadPct: number;
  locales: string[];
  precios: Record<string, number>; // skuTango -> precio de venta
}

export interface MargenProducto {
  skuTango: string;
  descripcion: string;
  precioVenta: number;
  costo: number;      // costo de receta con impuestos
  recetaFalta: boolean; // la receta no está / está incompleta (costo 0)
  cmvPct: number;
  regalias: number;
  publicidad: number;
  margen: number;
  margenPct: number;
  unidades: number;   // vendidas en el período (Tango)
}

export function margenDe(
  skuTango: string,
  descripcion: string,
  precioVenta: number,
  costo: number,
  lista: Pick<Lista, "regaliasPct" | "publicidadPct">,
  unidades = 0
): MargenProducto {
  const regalias = precioVenta * (lista.regaliasPct / 100) * IVA;
  const publicidad = precioVenta * (lista.publicidadPct / 100) * IVA;
  const margen = precioVenta - costo - regalias - publicidad;
  return {
    skuTango,
    descripcion,
    precioVenta,
    costo,
    recetaFalta: costo <= 0,
    cmvPct: precioVenta ? costo / precioVenta : 0,
    regalias,
    publicidad,
    margen,
    margenPct: precioVenta ? margen / precioVenta : 0,
    unidades,
  };
}
