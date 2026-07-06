import { readStore, writeStore } from "./store";

// Inventario de IT / Infraestructura: recursos que tenemos, su estado y lo que
// falta comprar. CRUD simple persistido (KV en prod). Solo lo maneja el admin.

export interface ItemInventario {
  id: string;
  nombre: string;       // "Notebook Lenovo", "Mouse", "Monitor 24\"", "TV"…
  categoria: string;    // Notebooks | Monitores | Periféricos | Red | Impresión | Audio/Video | Otros
  cantidad: number;
  estado: string;       // ver ESTADOS_INV en lib/inventario.ts
  nota?: string;
  actualizado: string;  // ISO
}

const KEY = "inventario";

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function getInventario(): Promise<ItemInventario[]> {
  const items = (await readStore<ItemInventario[] | null>(KEY, null)) ?? [];
  return [...items].sort((a, b) => (b.actualizado || "").localeCompare(a.actualizado || ""));
}

/** Alta (sin id) o edición (con id) de un ítem. */
export async function upsertItem(
  input: Partial<ItemInventario> & { nombre?: string }
): Promise<ItemInventario[]> {
  const items = (await readStore<ItemInventario[] | null>(KEY, null)) ?? [];
  const ahora = new Date().toISOString();

  if (input.id) {
    const i = items.findIndex((x) => x.id === input.id);
    if (i >= 0) {
      items[i] = {
        ...items[i],
        ...(input.nombre !== undefined ? { nombre: String(input.nombre).trim() } : {}),
        ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
        ...(input.cantidad !== undefined ? { cantidad: Math.max(0, Math.round(Number(input.cantidad) || 0)) } : {}),
        ...(input.estado !== undefined ? { estado: input.estado } : {}),
        ...(input.nota !== undefined ? { nota: input.nota } : {}),
        actualizado: ahora,
      };
    }
  } else {
    const nombre = String(input.nombre ?? "").trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");
    items.push({
      id: nuevoId(),
      nombre,
      categoria: input.categoria || "Otros",
      cantidad: Math.max(0, Math.round(Number(input.cantidad ?? 1) || 0)),
      estado: input.estado || "por-comprar",
      nota: input.nota || "",
      actualizado: ahora,
    });
  }
  await writeStore(KEY, items);
  return getInventario();
}

export async function removeItem(id: string): Promise<ItemInventario[]> {
  const items = ((await readStore<ItemInventario[] | null>(KEY, null)) ?? []).filter((x) => x.id !== id);
  await writeStore(KEY, items);
  return getInventario();
}
