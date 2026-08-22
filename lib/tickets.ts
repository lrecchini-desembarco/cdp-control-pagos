// Tickets a sistemas: config pura (usable en cliente y servidor).

// Quién puede ABRIR un ticket (la pantalla /tickets). Por ahora, solo
// sistemas02 mientras se prueba — se agranda cuando se decida abrirlo a
// todo el mundo. No confundir con el acceso al Panel de Sistemas
// (lib/panel-sistemas-store.ts): son listas independientes.
export const EMAILS_TICKETS = ["sistemas02@eldesembarco.com"];
export const puedeAbrirTicket = (email?: string | null): boolean =>
  Boolean(email) && EMAILS_TICKETS.includes(String(email).trim().toLowerCase());

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

/** Semilla inicial — el listado real es editable desde el panel (ver lib/tickets-store.ts getCategorias/setCategorias). */
export const CATEGORIAS_TICKET = [
  "Hardware",
  "Software",
  "Red / IP / WiFi",
  "Accesos y contraseñas",
  "Apps",
  "WhatsApp",
  "Nuevas Aperturas",
  "Duplicado",
  "Google Workspace",
  "Qlik",
  "Tango",
  "Ayres",
  "Contabilidad",
  "Otro",
];

/**
 * Columna (lista) del tablero de Trello -> categoría del ticket. Refleja las
 * automatizaciones ya armadas en Trello (ver docs/tickets-trello-import.md):
 * varias columnas del mismo flujo (ej. "Qlik" y "En poder de Qlik") caen en
 * la misma categoría porque son pasos del mismo trámite, no trámites distintos.
 */
export const TRELLO_LISTA_CATEGORIA: Record<string, string> = {
  "Pasar a Apps": "Apps",
  "Entrantes": "WhatsApp",
  "Nuevas Aperturas": "Nuevas Aperturas",
  "Tickets duplicados": "Duplicado",
  "Google Workspace": "Google Workspace",
  "Resetear clave": "Google Workspace",
  "Contabilidad": "Contabilidad",
  "Qlik": "Qlik",
  "En poder de Qlik": "Qlik",
  "Pasó a Mesa de Ayuda Ayres": "Ayres",
  "Lo tomó Ayres": "Ayres",
  "Pasó a Mesa de Ayuda Tango": "Tango",
  "Lo tomó Tango": "Tango",
};

/**
 * Columnas que además dicen algo del ESTADO del ticket (no solo la
 * categoría): "Bloqueantes" es la columna de "se espera al usuario o hay un
 * impedimento" y "Resuelto" cierra el ticket sin importar de qué categoría sea.
 */
export const TRELLO_LISTA_ESTADO: Record<string, EstadoTicket> = {
  "Bloqueantes": "espera",
  "Resuelto": "resuelto",
};

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
  solicitante: string; // email de quien lo abrió (o "WhatsApp: Nombre (+54...)" si vino del webhook)
  asignado?: string; // email de sistemas
  comentarios: Comentario[];
  creado: string;
  actualizado: string;
  /** De dónde salió. Default "web" (el formulario /tickets). */
  origen?: "web" | "whatsapp" | "trello";
  /** Tarjeta de Trello ya creada por el flujo de n8n, si la mandó, o traída por "Sincronizar con Trello". */
  trelloUrl?: string;
  /** shortLink de la card de Trello — clave para no importar la misma card dos veces. */
  trelloCardId?: string;
  /**
   * Sistemas cerró la conversación: no puede mandar más mensajes hasta que el
   * solicitante escriba de nuevo (eso la reabre solo) o alguien la reabra a mano.
   */
  conversacionCerrada?: boolean;
}

/** Lo que ve el solicitante en "Mis tickets" — no expone nada que no debería ver, pero hoy es igual al completo. */
export type TicketPublico = Ticket;
