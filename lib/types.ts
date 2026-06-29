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

/** Cada SKU vendido que aporta a la venta equivalente de un insumo CDP */
export interface CruceComponente {
  sku: string;
  nombre: string;
  vendidas: number;   // unidades vendidas del SKU
  factor: number;     // unidades de insumo CDP por 1 de venta
  subtotal: number;   // vendidas * factor
}

/** Nivel de urgencia de una alerta (ordena la atención del operador) */
export type Severidad = "critica" | "alta" | "media" | "info";

/** Categoría de la regla que disparó la alerta */
export type AlertaTipo =
  | "quiebre"               // sub-pedido fuerte: vende más de lo que repone
  | "sobrepedido"           // pide más de lo que vende: exceso/merma
  | "recurrente"            // mismo desvío repetido varios días: patrón, no ruido
  | "sucursal-sin-mapear"   // punto ciego: vende pero no entra al cruce
  | "insumo-sin-receta";    // insumo del CDP sin regla: no se puede contrastar

/**
 * Una alerta lista para mostrar. Pensada para que un encargado la entienda
 * de una sola lectura: qué pasa (detalle), por qué importa (porque) y qué
 * hacer (accion, con deep-link a la pantalla que lo resuelve).
 */
export interface Alerta {
  id: string;               // estable: permite deduplicar / silenciar a futuro
  tipo: AlertaTipo;
  severidad: Severidad;
  titulo: string;           // una línea legible por negocio
  detalle: string;          // qué está pasando, con números
  porque: string;           // impacto si no se actúa
  accion: { label: string; href: string }; // cómo resolverlo
  sucursal?: string;
  brand?: BrandId;
  codigoCdp?: string;
  fecha?: string;
  metrica?: string;         // valor destacado para el chip (ej. "-38%")
}

/** Conteo de alertas por severidad, para badges y KPIs */
export interface ResumenAlertas {
  total: number;
  critica: number;
  alta: number;
  media: number;
  info: number;
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
  componentes: CruceComponente[]; // desglose que explica la venta equivalente
}
