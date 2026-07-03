import { readStore, writeStore } from "./store";

// Cupones de descuento por reseña. Persistido (KV en prod). Reglas:
//  - 3 usos por cupón (3 compras con 15% OFF).
//  - Vence a los 60 días de emitido (no se puede canjear después).
//  - Anti-abuso: 1 cupón por teléfono + local (si ya tiene, se le devuelve el mismo).

export interface Cupon {
  codigo: string;        // DS-A1B2C3
  local: string;
  marca?: string;
  nombre: string;
  telefono: string;      // solo dígitos (normalizado)
  emitido: string;       // ISO
  vence?: string;        // ISO (emitido + VIGENCIA_DIAS). Opcional: los viejos se calculan al vuelo.
  usosRestantes: number; // arranca en 3
  usos: string[];        // fechas ISO de cada canje
  rating?: number;       // 1..5 que dejó en NUESTRA pantalla (para segmentar el CRM)
  consent?: boolean;     // aceptó recibir promos por WhatsApp (opt-in)
}

const KEY = "cupones";
const USOS_INICIALES = 3;
export const VIGENCIA_DIAS = 60;
const soloDigitos = (t: string) => String(t ?? "").replace(/\D/g, "");

/** Fecha de vencimiento a partir de la de emisión (emitido + VIGENCIA_DIAS). */
function calcVence(emitidoISO: string): string {
  const d = new Date(emitidoISO);
  d.setDate(d.getDate() + VIGENCIA_DIAS);
  return d.toISOString();
}
/** Vencimiento efectivo (usa el guardado; si es un cupón viejo, lo calcula). */
export function venceDe(c: Cupon): string {
  return c.vence ?? calcVence(c.emitido);
}
/** ¿El cupón sigue vigente hoy? (comparación ISO en UTC). */
export function estaVigente(c: Cupon): boolean {
  return new Date().toISOString() <= venceDe(c);
}
// Alfabeto sin caracteres ambiguos (0/O, 1/I) para leerlo en voz alta en la caja.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function nuevoCodigo(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return `DS-${s}`;
}

async function todos(): Promise<Cupon[]> {
  return (await readStore<Cupon[] | null>(KEY, null)) ?? [];
}

/** Emite un cupón nuevo, o devuelve el que ya tiene esa persona en ese local (anti-abuso). */
export async function emitirCupon(input: {
  local: string;
  marca?: string;
  nombre: string;
  telefono: string;
  rating?: number;
  consent?: boolean;
}): Promise<Cupon> {
  const telefono = soloDigitos(input.telefono);
  const cupones = await todos();
  const existente = cupones.find((c) => c.telefono === telefono && c.local === input.local);
  if (existente) {
    // Ya tenía cupón en este local: no creamos otro, pero actualizamos sus datos
    // (la última reseña gana: nombre, rating, consentimiento).
    if (input.nombre?.trim()) existente.nombre = input.nombre.trim();
    if (typeof input.rating === "number") existente.rating = input.rating;
    if (typeof input.consent === "boolean") existente.consent = input.consent;
    await writeStore(KEY, cupones);
    return existente;
  }

  let codigo = nuevoCodigo();
  while (cupones.some((c) => c.codigo === codigo)) codigo = nuevoCodigo();

  const emitido = new Date().toISOString();
  const cupon: Cupon = {
    codigo,
    local: input.local,
    marca: input.marca,
    nombre: input.nombre.trim(),
    telefono,
    emitido,
    vence: calcVence(emitido),
    usosRestantes: USOS_INICIALES,
    usos: [],
    rating: input.rating,
    consent: input.consent,
  };
  cupones.push(cupon);
  await writeStore(KEY, cupones);
  return cupon;
}

/** Busca por código exacto o por teléfono (matchea aunque falte el prefijo 549). */
export async function buscarCupon(q: string): Promise<Cupon | undefined> {
  const codigo = q.trim().toUpperCase();
  const tel = soloDigitos(q);
  const cupones = await todos();
  const porCodigo = cupones.find((c) => c.codigo.toUpperCase() === codigo);
  if (porCodigo) return porCodigo;
  if (tel.length >= 6) return cupones.find((c) => c.telefono === tel || c.telefono.endsWith(tel));
  return undefined;
}

/** Canjea un uso del cupón (una compra). Devuelve el estado actualizado. */
export async function usarCupon(codigo: string): Promise<{ ok: boolean; cupon?: Cupon; error?: string }> {
  const cupones = await todos();
  const c = cupones.find((x) => x.codigo.toUpperCase() === codigo.trim().toUpperCase());
  if (!c) return { ok: false, error: "Cupón no encontrado." };
  if (!estaVigente(c)) return { ok: false, error: `Cupón vencido (venció el ${venceDe(c).slice(0, 10)}).`, cupon: c };
  if (c.usosRestantes <= 0) return { ok: false, error: "Cupón agotado (ya usó las 3 compras).", cupon: c };
  c.usosRestantes -= 1;
  c.usos.push(new Date().toISOString());
  await writeStore(KEY, cupones);
  return { ok: true, cupon: c };
}

export async function listarCupones(): Promise<Cupon[]> {
  return (await todos()).sort((a, b) => b.emitido.localeCompare(a.emitido));
}

/** Elimina un cupón por código (para sacar cupones de prueba o abuso). */
export async function eliminarCupon(codigo: string): Promise<boolean> {
  const cupones = await todos();
  const rest = cupones.filter((c) => c.codigo.toUpperCase() !== codigo.trim().toUpperCase());
  if (rest.length === cupones.length) return false;
  await writeStore(KEY, rest);
  return true;
}
