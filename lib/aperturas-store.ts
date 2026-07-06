import { readStore, writeStore } from "./store";

// Cuadro de apertura de locales (lo que hoy es un JPG en un pendrive). Cada local:
// nombre, marca que va a operar, y estados L (Local/inmueble) y F (Firmado).
// Persistido (KV en prod). Se siembra con los 46 del JPG del 10/06.

export type EstadoLF = "si" | "no" | "reservado";

export interface LocalApertura {
  id: string;
  nombre: string;
  marca: string;      // tasty | tasty-mila | desembarco | mila
  local: EstadoLF;    // L: ¿está el inmueble?
  firma: EstadoLF;    // F: ¿contrato firmado?
  orden: number;      // para mantener el orden del cuadro
  actualizado: string;
}

const KEY = "aperturas";
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Semilla: los 46 del JPG "Locales Actualizados 10-06". L=si/no/reservado, F=si (todos firmados).
const S = (nombre: string, marca: string, local: EstadoLF): [string, string, EstadoLF] => [nombre, marca, local];
const SEED_RAW: [string, string, EstadoLF][] = [
  S("Banda de Río Salí", "tasty", "si"), S("Barranqueras", "tasty-mila", "no"), S("Barrio Chino", "tasty", "si"),
  S("Barrio Sur", "tasty", "no"), S("Berazategui", "tasty", "si"), S("Berisso", "tasty-mila", "si"),
  S("Caballito 2 (Boedo)", "tasty", "no"), S("Catamarca", "tasty", "no"), S("Colegiales", "tasty-mila", "no"),
  S("Concepción (Tucumán)", "tasty", "no"), S("Corrientes 2", "tasty", "no"), S("Devoto", "tasty-mila", "no"),
  S("Escobar", "tasty", "no"), S("Facultad de Medicina", "tasty", "no"), S("Garín (Escobar)", "tasty", "no"),
  S("Godoy Cruz (Mendoza)", "tasty", "no"), S("Hurlingham", "tasty", "no"),
  S("Ituzaingó", "tasty", "si"), S("Jujuy", "tasty", "no"), S("Junín", "tasty", "si"),
  S("La Tablada", "tasty", "no"), S("Lanús", "tasty", "reservado"), S("Los Polvorines", "tasty", "si"),
  S("Mar del Plata 2", "tasty", "no"), S("Merlo 2", "tasty", "no"), S("Morón", "tasty", "no"),
  S("Nazca", "tasty-mila", "si"), S("Neuquén Capital", "tasty", "si"), S("Parque Chas", "tasty", "si"),
  S("Paternal", "tasty", "si"), S("Perico", "tasty", "si"), S("Plottier", "tasty-mila", "si"),
  S("Resistencia 2", "tasty", "no"), S("Rosario 2", "tasty-mila", "no"),
  S("San Isidro", "tasty", "no"), S("San Juan", "tasty", "reservado"), S("Solano", "tasty", "si"),
  S("Tafí Viejo (Tucumán)", "tasty", "no"), S("Terminal de Ómnibus (Tucumán)", "tasty", "no"), S("Tucumán III", "tasty", "no"),
  S("V. Ballester", "tasty", "reservado"), S("Varela", "tasty-mila", "si"), S("Villa Martelli", "tasty", "no"),
  S("Virreyes", "tasty", "si"), S("Yerba Buena", "tasty", "si"), S("Zona a definir", "tasty", "no"),
];

function semilla(): LocalApertura[] {
  const ahora = "2026-06-10T12:00:00.000Z";
  return SEED_RAW.map(([nombre, marca, local], i) => ({
    id: `seed-${i}`, nombre, marca, local, firma: "si" as EstadoLF, orden: i, actualizado: ahora,
  }));
}

export async function getAperturas(): Promise<LocalApertura[]> {
  const saved = await readStore<LocalApertura[] | null>(KEY, null);
  const base = Array.isArray(saved) && saved.length ? saved : semilla();
  return [...base].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
}

export async function upsertApertura(input: Partial<LocalApertura> & { nombre?: string }): Promise<LocalApertura[]> {
  const items = await getAperturas();
  const ahora = new Date().toISOString();
  if (input.id) {
    const i = items.findIndex((x) => x.id === input.id);
    if (i >= 0) {
      items[i] = {
        ...items[i],
        ...(input.nombre !== undefined ? { nombre: String(input.nombre).trim() } : {}),
        ...(input.marca !== undefined ? { marca: input.marca } : {}),
        ...(input.local !== undefined ? { local: input.local } : {}),
        ...(input.firma !== undefined ? { firma: input.firma } : {}),
        actualizado: ahora,
      };
    }
  } else {
    const nombre = String(input.nombre ?? "").trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");
    items.push({
      id: nuevoId(), nombre, marca: input.marca || "tasty",
      local: (input.local as EstadoLF) || "no", firma: (input.firma as EstadoLF) || "no",
      orden: Math.max(0, ...items.map((x) => x.orden ?? 0)) + 1, actualizado: ahora,
    });
  }
  await writeStore(KEY, items);
  return getAperturas();
}

export async function removeApertura(id: string): Promise<LocalApertura[]> {
  const items = (await getAperturas()).filter((x) => x.id !== id);
  await writeStore(KEY, items);
  return getAperturas();
}
