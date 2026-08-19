import { readStore, writeStore } from "./store";
import type { Ticket, EstadoTicket, PrioridadTicket, Comentario } from "./tickets";

// Tickets a sistemas: CRUD simple persistido (KV en prod), mismo patrón que
// credenciales/inventario. Cualquier cuenta logueada puede crear un ticket y
// comentar en el propio; asignar/cambiar estado es cosa de sistemas (lo corta
// la API, no esta capa).

const KEY = "tickets";

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const todos = async (): Promise<Ticket[]> => (await readStore<Ticket[] | null>(KEY, null)) ?? [];

/** Todos, más nuevo primero por actividad (para la vista de sistemas). */
export async function getTickets(): Promise<Ticket[]> {
  return (await todos()).sort((a, b) => (b.actualizado || "").localeCompare(a.actualizado || ""));
}

/** Solo los de un solicitante (para "Mis tickets"). */
export async function getTicketsDe(email: string): Promise<Ticket[]> {
  const e = email.trim().toLowerCase();
  return (await getTickets()).filter((t) => t.solicitante.toLowerCase() === e);
}

export async function crearTicket(
  input: {
    titulo: string;
    categoria: string;
    prioridad: PrioridadTicket;
    descripcion: string;
    origen?: "web" | "whatsapp";
    trelloUrl?: string;
  },
  email: string
): Promise<{ items: Ticket[]; creado: Ticket }> {
  const titulo = String(input.titulo ?? "").trim();
  const descripcion = String(input.descripcion ?? "").trim();
  if (!titulo) throw new Error("Poné un título.");
  if (!descripcion) throw new Error("Contanos qué pasa.");

  const lista = await todos();
  const nro = Math.max(0, ...lista.map((t) => t.nro)) + 1;
  const ahora = new Date().toISOString();
  const creado: Ticket = {
    id: nuevoId(),
    nro,
    titulo,
    categoria: input.categoria || "Otro",
    prioridad: input.prioridad || "media",
    estado: "abierto",
    descripcion,
    solicitante: email,
    comentarios: [],
    creado: ahora,
    actualizado: ahora,
    ...(input.origen ? { origen: input.origen } : {}),
    ...(input.trelloUrl ? { trelloUrl: String(input.trelloUrl).trim() } : {}),
  };
  lista.push(creado);
  await writeStore(KEY, lista);
  return { items: await getTickets(), creado };
}

/** Cambios de sistemas: estado, a quién está asignado, prioridad. */
export async function actualizarTicket(
  id: string,
  patch: { estado?: EstadoTicket; asignado?: string; prioridad?: PrioridadTicket }
): Promise<Ticket[]> {
  const lista = await todos();
  const i = lista.findIndex((t) => t.id === id);
  if (i < 0) throw new Error("No existe ese ticket.");
  lista[i] = {
    ...lista[i],
    ...(patch.estado !== undefined ? { estado: patch.estado } : {}),
    ...(patch.asignado !== undefined ? { asignado: patch.asignado || undefined } : {}),
    ...(patch.prioridad !== undefined ? { prioridad: patch.prioridad } : {}),
    actualizado: new Date().toISOString(),
  };
  await writeStore(KEY, lista);
  return getTickets();
}

/** Comentario del solicitante o de sistemas. Reabre el ticket si estaba resuelto/cerrado y comenta el solicitante. */
export async function comentarTicket(
  id: string,
  texto: string,
  autor: string,
  deSistemas: boolean
): Promise<Ticket[]> {
  const t = String(texto ?? "").trim();
  if (!t) throw new Error("El comentario está vacío.");

  const lista = await todos();
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("No existe ese ticket.");
  const ahora = new Date().toISOString();
  const comentario: Comentario = { id: nuevoId(), autor, deSistemas, texto: t, cuando: ahora };
  const reabre = !deSistemas && (lista[i].estado === "resuelto" || lista[i].estado === "cerrado");
  lista[i] = {
    ...lista[i],
    comentarios: [...lista[i].comentarios, comentario],
    ...(reabre ? { estado: "en-curso" as EstadoTicket } : {}),
    actualizado: ahora,
  };
  await writeStore(KEY, lista);
  return getTickets();
}

export const getTicket = async (id: string): Promise<Ticket | null> => (await todos()).find((t) => t.id === id) ?? null;
