import { readStore, writeStore } from "./store";
import { CATEGORIAS_TICKET, TRELLO_LISTA_CATEGORIA, TRELLO_LISTA_ESTADO } from "./tickets";
import type { Ticket, EstadoTicket, PrioridadTicket, Comentario } from "./tickets";
import type { TrelloCard } from "./trello";
import { buscarCardPorId } from "./trello";

// Tickets a sistemas: CRUD simple persistido (KV en prod), mismo patrón que
// credenciales/inventario. Cualquier cuenta logueada puede crear un ticket y
// comentar en el propio; asignar/cambiar estado es cosa de sistemas (lo corta
// la API, no esta capa).

const KEY = "tickets";
const KEY_CATEGORIAS = "tickets-categorias";

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Categoría que corresponde a esa columna de Trello, o undefined si no hay mapeo para ella. */
const categoriaDesdeLista = (nombreLista?: string): string | undefined =>
  TRELLO_LISTA_CATEGORIA[(nombreLista ?? "").trim()];

/** Estado que corresponde a esa columna de Trello, o undefined si esa columna no dice nada del estado. */
const estadoDesdeLista = (nombreLista?: string): EstadoTicket | undefined =>
  TRELLO_LISTA_ESTADO[(nombreLista ?? "").trim()];

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
    categoria: input.categoria || (input.origen === "whatsapp" ? "WhatsApp" : "Otro"),
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

/** Cambios de sistemas: estado, a quién está asignado, prioridad, o cerrar/reabrir la conversación. */
export async function actualizarTicket(
  id: string,
  patch: { estado?: EstadoTicket; asignado?: string; prioridad?: PrioridadTicket; conversacionCerrada?: boolean }
): Promise<Ticket[]> {
  const lista = await todos();
  const i = lista.findIndex((t) => t.id === id);
  if (i < 0) throw new Error("No existe ese ticket.");
  lista[i] = {
    ...lista[i],
    ...(patch.estado !== undefined ? { estado: patch.estado } : {}),
    ...(patch.asignado !== undefined ? { asignado: patch.asignado || undefined } : {}),
    ...(patch.prioridad !== undefined ? { prioridad: patch.prioridad } : {}),
    ...(patch.conversacionCerrada !== undefined ? { conversacionCerrada: patch.conversacionCerrada } : {}),
    actualizado: new Date().toISOString(),
  };
  await writeStore(KEY, lista);
  return getTickets();
}

/**
 * Comentario del solicitante o de sistemas.
 * - Sistemas no puede comentar si la conversación está cerrada (se lo corta acá, no solo en la UI).
 * - Si comenta el solicitante: reabre el estado si estaba resuelto/cerrado, y reabre la
 *   conversación si sistemas la había cerrado — es la señal de "el usuario escribió de nuevo".
 */
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
  if (deSistemas && lista[i].conversacionCerrada) {
    throw new Error("La conversación está cerrada. Reabrila para poder responder.");
  }
  const ahora = new Date().toISOString();
  const comentario: Comentario = { id: nuevoId(), autor, deSistemas, texto: t, cuando: ahora };
  const reabreEstado = !deSistemas && (lista[i].estado === "resuelto" || lista[i].estado === "cerrado");
  const reabreConversacion = !deSistemas && lista[i].conversacionCerrada;
  lista[i] = {
    ...lista[i],
    comentarios: [...lista[i].comentarios, comentario],
    ...(reabreEstado ? { estado: "en-curso" as EstadoTicket } : {}),
    ...(reabreConversacion ? { conversacionCerrada: false } : {}),
    actualizado: ahora,
  };
  await writeStore(KEY, lista);
  return getTickets();
}

export const getTicket = async (id: string): Promise<Ticket | null> => (await todos()).find((t) => t.id === id) ?? null;

/**
 * Trae las cards del tablero que todavía no son un ticket (por trelloCardId,
 * chequeando también contra el trelloUrl viejo de los que vinieron por el
 * webhook de n8n antes de que existiera este campo). La categoría y el
 * estado salen de en qué columna está la card (ver TRELLO_LISTA_CATEGORIA /
 * TRELLO_LISTA_ESTADO en lib/tickets.ts); si la columna no tiene mapeo,
 * entran como "Otro" / "abierto" y sistemas las clasifica a mano.
 */
export async function importarDesdeTrello(cards: TrelloCard[]): Promise<{ items: Ticket[]; agregados: number }> {
  const lista = await todos();
  const yaImportadas = new Set(
    lista.flatMap((t) => [t.trelloCardId, extraerShortLink(t.trelloUrl)].filter(Boolean) as string[])
  );
  let nro = Math.max(0, ...lista.map((t) => t.nro));
  const ahora = new Date().toISOString();
  const nuevos: Ticket[] = [];
  for (const c of cards) {
    if (yaImportadas.has(c.shortLink)) continue;
    nro += 1;
    nuevos.push({
      id: nuevoId(),
      nro,
      titulo: c.name || `Card ${c.shortLink}`,
      categoria: categoriaDesdeLista(c.list?.name) ?? "Otro",
      prioridad: "media",
      estado: estadoDesdeLista(c.list?.name) ?? "abierto",
      descripcion: c.desc?.trim() || c.name || "(la card no tiene descripción en Trello)",
      solicitante: "Trello",
      comentarios: [],
      creado: ahora,
      actualizado: ahora,
      origen: "trello",
      trelloUrl: c.shortUrl,
      trelloCardId: c.shortLink,
    });
  }
  if (nuevos.length) await writeStore(KEY, [...lista, ...nuevos]);
  return { items: await getTickets(), agregados: nuevos.length };
}

function extraerShortLink(url?: string): string | undefined {
  return url?.match(/trello\.com\/c\/([a-zA-Z0-9]+)/)?.[1];
}

/**
 * Backfill único: recorre los tickets ya importados de Trello y les
 * actualiza categoría/estado según la columna en la que está la card HOY.
 * Sirve para los que quedaron con categoría "Otro" (se importaron antes de
 * que existiera este mapeo) o que en Trello ya están resueltos/bloqueados
 * pero acá seguían marcados como abiertos.
 *
 * Usa buscarCardPorId (no la lista del tablero) porque funciona aunque la
 * card ya se haya movido a otro tablero — pasa con "Pasar a Apps". No pisa
 * el estado de un ticket que sistemas ya cerró a mano ("cerrado"): esa es la
 * última palabra de sistemas, no algo que la sync deba revertir.
 */
export async function recategorizarDesdeTrello(): Promise<{ items: Ticket[]; actualizados: number; sinCard: number }> {
  // Si el panel ya tenía su propia lista de categorías guardada en KV (de antes de
  // este mapeo), asegurarse de que las categorías nuevas existan igual.
  const categoriasActuales = await getCategorias();
  const faltantes = CATEGORIAS_TICKET.filter((c) => !categoriasActuales.includes(c));
  if (faltantes.length) await setCategorias([...categoriasActuales, ...faltantes]);

  const lista = await todos();
  let actualizados = 0;
  let sinCard = 0;
  const ahora = new Date().toISOString();
  for (const t of lista) {
    if (t.origen !== "trello" || !t.trelloCardId) continue;
    const card = await buscarCardPorId(t.trelloCardId).catch(() => undefined);
    if (card === undefined) continue; // error de red/API — no tocar el ticket
    if (card === null) {
      sinCard += 1;
      continue;
    }
    const nuevaCategoria = categoriaDesdeLista(card.list?.name);
    const nuevoEstado = estadoDesdeLista(card.list?.name);
    let cambio = false;
    if (nuevaCategoria && nuevaCategoria !== t.categoria) {
      t.categoria = nuevaCategoria;
      cambio = true;
    }
    if (nuevoEstado && nuevoEstado !== t.estado && t.estado !== "cerrado") {
      t.estado = nuevoEstado;
      cambio = true;
    }
    if (cambio) {
      t.actualizado = ahora;
      actualizados += 1;
    }
  }
  if (actualizados) await writeStore(KEY, lista);
  return { items: await getTickets(), actualizados, sinCard };
}

/** Categorías disponibles al abrir/clasificar un ticket. Editable desde el panel. */
export async function getCategorias(): Promise<string[]> {
  return (await readStore<string[] | null>(KEY_CATEGORIAS, null)) ?? CATEGORIAS_TICKET;
}

export async function setCategorias(categorias: string[]): Promise<string[]> {
  const limpio = Array.from(new Set(categorias.map((c) => c.trim()).filter(Boolean)));
  if (!limpio.length) throw new Error("Tiene que quedar al menos una categoría.");
  await writeStore(KEY_CATEGORIAS, limpio);
  return limpio;
}
