import { listarCupones } from "./cupones-store";
import type { Cupon } from "./cupones-store";

// Capa CRM: deriva la lista de CLIENTES (una fila por teléfono) a partir de las
// reseñas/cupones capturados. Es una función PURA de agregación: hoy lee del store
// de cupones; si el volumen crece, se reemplaza la fuente por una tabla/DB sin tocar
// la vista ni la API (mismo shape Cliente).

export interface Cliente {
  telefono: string;
  nombre: string;
  locales: string[];
  marcas: string[];
  rating: number | null;   // promedio de las estrellas que dejó
  consent: boolean;        // aceptó promos por WhatsApp en alguna reseña
  cupones: number;         // cuántos cupones tiene (≈ locales reseñados)
  canjes: number;          // compras usadas (suma de usos)
  primera: string;         // ISO primera reseña
  ultima: string;          // ISO última reseña
}

export function agregarClientes(cupones: Cupon[]): Cliente[] {
  const map = new Map<string, { c: Cliente; ratings: number[] }>();
  for (const cu of cupones) {
    const tel = cu.telefono;
    if (!tel) continue;
    let e = map.get(tel);
    if (!e) {
      e = {
        c: { telefono: tel, nombre: cu.nombre, locales: [], marcas: [], rating: null, consent: false, cupones: 0, canjes: 0, primera: cu.emitido, ultima: cu.emitido },
        ratings: [],
      };
      map.set(tel, e);
    }
    const c = e.c;
    if (cu.nombre && cu.emitido >= c.ultima) c.nombre = cu.nombre; // nombre más reciente
    if (cu.local && !c.locales.includes(cu.local)) c.locales.push(cu.local);
    if (cu.marca && !c.marcas.includes(cu.marca)) c.marcas.push(cu.marca);
    if (typeof cu.rating === "number") e.ratings.push(cu.rating);
    if (cu.consent) c.consent = true;
    c.cupones += 1;
    c.canjes += cu.usos.length;
    if (cu.emitido < c.primera) c.primera = cu.emitido;
    if (cu.emitido > c.ultima) c.ultima = cu.emitido;
  }
  const out: Cliente[] = [];
  for (const { c, ratings } of Array.from(map.values())) {
    c.rating = ratings.length ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10 : null;
    out.push(c);
  }
  return out.sort((a, b) => b.ultima.localeCompare(a.ultima));
}

export async function getClientes(): Promise<Cliente[]> {
  return agregarClientes(await listarCupones());
}
