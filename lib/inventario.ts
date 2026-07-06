// Estados y categorías del inventario de IT. Config pura (usable en cliente).

export type GrupoInv = "tenemos" | "comprar" | "otros";

export interface EstadoInv {
  id: string;
  label: string;
  grupo: GrupoInv;
  tone: "ok" | "action" | "warn" | "bad" | "neutral" | "muted";
}

export const ESTADOS_INV: EstadoInv[] = [
  { id: "listo", label: "Listo para usar", grupo: "tenemos", tone: "ok" },
  { id: "para-formatear", label: "Para formatear", grupo: "tenemos", tone: "action" },
  { id: "en-uso", label: "En uso", grupo: "tenemos", tone: "neutral" },
  { id: "por-comprar", label: "Por comprar", grupo: "comprar", tone: "bad" },
  { id: "pedido", label: "Pedido", grupo: "comprar", tone: "warn" },
  { id: "comprado", label: "Comprado", grupo: "comprar", tone: "warn" },
  { id: "llego", label: "Llegó", grupo: "comprar", tone: "action" },
  { id: "baja", label: "Baja / roto", grupo: "otros", tone: "muted" },
];

export const estadoInv = (id: string): EstadoInv =>
  ESTADOS_INV.find((e) => e.id === id) ?? { id, label: id, grupo: "otros", tone: "neutral" };

// Aprobación de compra (la decide el Dueño). Solo aplica a lo que hay que comprar.
export const APROBACIONES: { id: string; label: string; tone: EstadoInv["tone"] }[] = [
  { id: "pendiente", label: "Pendiente", tone: "warn" },
  { id: "aprobado", label: "Aprobado", tone: "ok" },
  { id: "rechazado", label: "Rechazado", tone: "bad" },
];
export const aprobacionInv = (id: string) => APROBACIONES.find((a) => a.id === id) ?? APROBACIONES[0];

/** ¿Este estado corresponde a una compra (necesita aprobación del Dueño)? */
export const necesitaAprobacion = (estado: string) => estadoInv(estado).grupo === "comprar";

export const CATEGORIAS_INV = [
  "Notebooks",
  "Monitores",
  "Periféricos",
  "Red",
  "Impresión",
  "Audio/Video",
  "Servidores",
  "Otros",
];
