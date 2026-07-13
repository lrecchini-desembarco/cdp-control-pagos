/**
 * Contratos de datos crudos. La app no sabe de dónde vienen (Raven, Tango/SQL,
 * Sheets…): cualquier adapter devuelve este shape y el motor de cruce los combina.
 */

/** Una línea de pedido al CDP: cuánto pidió una sucursal de un insumo, un día. */
export interface PedidoCdp {
  fecha: string;            // ISO AAAA-MM-DD
  codigoCdp: string;        // código del insumo
  sucursalCanonico: string; // código canónico de la sucursal (DS-FLO…)
  unidades: number;
}

/** Una línea de venta: unidades vendidas de un SKU en una sucursal, un día y turno. */
export interface VentaSku {
  fecha: string;            // ISO AAAA-MM-DD
  sku: string;              // Cód. Art. Tango del producto vendido
  nombre?: string;          // descripción del artículo (DESC_CTA_ARTICULO)
  sucursalCanonico: string; // código canónico de la sucursal
  unidades: number;
  importe?: number;         // $ real del renglón (IMPORTE_NETO de Tango), si la vista lo expone
  turno?: string;           // mediodia | tarde | noche (slug de lib/turnos)
}

/** Precio vigente de un producto en una sucursal (precio efectivo de la última venta). */
export interface PrecioProducto {
  sku: string;
  nombre: string;
  sucursal: string; // DESC_SUCURSAL
  precio: number; // PVP con impuestos (unitario)
  precioNeto: number; // neto sin impuestos (unitario)
  actualizado?: string; // ISO: fecha de la venta que fijó el precio
}

/** Un cobro consolidado: cuánto entró por un medio de pago, en un local, un día.
 *  Ojo: la vista trae ID_SUCURSAL (número), no el nombre — Tango no lo expone todavía. */
export interface CobroDia {
  fecha: string;       // ISO AAAA-MM-DD
  idSucursal: number;  // ID de la sucursal en Tango (sin nombre por ahora)
  medioPago: string;   // "Efectivo", "MERCADOPAGO", "PEYA TARJETA"…
  importe: number;
}

/** Ventas por hora: importe y cantidad de tickets de un local, en una hora de un día. */
export interface VentaHora {
  fecha: string;       // ISO AAAA-MM-DD
  idSucursal: number;
  hora: number;        // 0..23
  importe: number;
  tickets: number;     // cantidad de comprobantes (para ticket promedio)
}

/** Rango de consulta común a todas las fuentes. */
export interface RangoQuery {
  desde: string; // ISO
  hasta: string; // ISO
}

/** Fuente de pedidos al CDP (hoy: Raven). */
export interface PedidosSource {
  getPedidos(q: RangoQuery): Promise<PedidoCdp[]>;
}

/** Fuente de ventas por SKU (hoy: Tango / SQL Server). */
export interface VentasSource {
  getVentas(q: RangoQuery): Promise<VentaSku[]>;
}

/** Fuente del maestro de artículos para auditar calidad de datos (hoy: Tango). */
export interface CatalogoSource {
  getCatalogo(): Promise<import("../types").ArticuloCatalogo[]>;
}

/** Fuente de precios de productos (hoy: Tango, precio efectivo de las comandas). */
export interface PreciosSource {
  getPrecios(): Promise<PrecioProducto[]>;
}
