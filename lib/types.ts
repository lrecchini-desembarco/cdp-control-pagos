export type BrandId = "desembarco" | "tasty" | "mila";

export interface Brand {
  id: BrandId;
  name: string;
  color: string;
}

/** Respuesta del endpoint Raven (CDP -> sucursales) */
export interface RavenBranch {
  branch_code: string;
  branch_name: string;
  qty: number;
}
export interface RavenItem {
  code: string;
  name: string;
  unit: string;
  qty: number;
  branches: RavenBranch[];
}

/** Sucursal canónica */
export interface Sucursal {
  ravenCode: string;   // código que devuelve Raven (1007, 1014...)
  canonico: string;    // código interno DS
  nombre: string;
  brand: BrandId;
  activa: boolean;
}

/** Mapeo de producto: insumo CDP -> SKU de venta, con factor (BOM) */
export interface ProductoMap {
  codigoCdp: string;     // código Tango del insumo que entrega el CDP
  insumoNombre: string;
  skuVenta: string;      // Cód. Art. Tango del producto vendido
  skuNombre: string;
  factor: number;        // unidades de insumo CDP por 1 de venta
  modo: "directo" | "bom";
}

/** Fila del cruce: por sucursal/producto/fecha */
export interface CruceRow {
  fecha: string;
  brand: BrandId;
  sucursal: string;        // nombre canónico
  codigoCdp: string;
  producto: string;
  pedidoCdp: number;       // lo que la sucursal pidió al CDP
  ventaEquiv: number;      // ventas traducidas a insumo CDP (via factor)
  unidad: string;
}
