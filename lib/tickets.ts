// Tickets a sistemas: config pura (usable en cliente y servidor).

export type PrioridadTicket = "baja" | "media" | "alta" | "urgente";
export type EstadoTicket = "abierto" | "en-curso" | "espera" | "resuelto" | "cerrado";

export interface PrioridadInfo {
  id: PrioridadTicket;
  label: string;
  tone: "muted" | "action" | "warn" | "bad";
}
export const PRIORIDADES: PrioridadInfo[] = [
  { id: "baja", label: "Baja", tone: "muted" },
  { id: "media", label: "Media", tone: "action" },
  { id: "alta", label: "Alta", tone: "warn" },
  { id: "urgente", label: "Urgente (no puedo trabajar)", tone: "bad" },
];
export const prioridad = (id: string): PrioridadInfo => PRIORIDADES.find((p) => p.id === id) ?? PRIORIDADES[1];

export interface EstadoInfo {
  id: EstadoTicket;
  label: string;
  tone: "bad" | "warn" | "action" | "ok" | "muted";
  /** true = el ticket ya no necesita acción (para las métricas de "abiertos"). */
  cerrado: boolean;
}
export const ESTADOS_TICKET: EstadoInfo[] = [
  { id: "abierto", label: "Abierto", tone: "bad", cerrado: false },
  { id: "en-curso", label: "En curso", tone: "warn", cerrado: false },
  { id: "espera", label: "Esperando al usuario", tone: "action", cerrado: false },
  { id: "resuelto", label: "Resuelto", tone: "ok", cerrado: true },
  { id: "cerrado", label: "Cerrado", tone: "muted", cerrado: true },
];
export const estadoTicket = (id: string): EstadoInfo => ESTADOS_TICKET.find((e) => e.id === id) ?? ESTADOS_TICKET[0];

export const CATEGORIAS_TICKET = ["Hardware", "Software", "Red / IP / WiFi", "Accesos y contraseñas", "Otro"];

/** Mismos tonos que el resto de la app (ver toneCls en lib/parque.ts). */
export const toneClsTicket = (t: string) =>
  ({
    ok: "bg-ok/10 text-ok border-ok/30",
    action: "bg-action/10 text-action border-action/30",
    warn: "bg-warn/10 text-warn border-warn/30",
    bad: "bg-bad/10 text-bad border-bad/30",
    muted: "bg-ink/5 text-faint border-line",
  }[t] || "bg-ink/5 text-muted border-line");

export interface Comentario {
  id: string;
  autor: string;
  /** true = lo escribió alguien con acceso al Panel de Sistemas (burbuja distinta). */
  deSistemas: boolean;
  texto: string;
  cuando: string; // ISO
}

export interface Ticket {
  id: string;
  nro: number;
  titulo: string;
  categoria: string;
  prioridad: PrioridadTicket;
  estado: EstadoTicket;
  descripcion: string;
  solicitante: string; // email de quien lo abrió
  asignado?: string; // email de sistemas
  comentarios: Comentario[];
  creado: string;
  actualizado: string;
}

/** Lo que ve el solicitante en "Mis tickets" — no expone nada que no debería ver, pero hoy es igual al completo. */
export type TicketPublico = Ticket;
