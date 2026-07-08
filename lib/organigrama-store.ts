import { readStore, writeStore } from "./store";
import { descendientes, type NodoOrg } from "./organigrama";

// Organigrama persistido (KV en prod, .data/organigrama.json en local). Lista plana
// de nodos; el árbol se arma al leer. Lo edita admin/operaciones; lo ve todo el mundo.

const KEY = "organigrama";

// Semilla: el organigrama de Administración y Finanzas (arranca con datos reales;
// desde la pantalla se sigue editando). El orden del array = orden de despliegue.
const SEED: NodoOrg[] = [
  { id: "marina",   nombre: "Marina Fernandez", cargo: "Administración y finanzas",          parentId: null },
  { id: "cristian", nombre: "Cristian Bustos",  cargo: "Gestión administrativa",              parentId: "marina" },
  { id: "ezequiel", nombre: "Ezequiel Marini",  cargo: "Auditor",                             parentId: "cristian" },
  { id: "ana",      nombre: "Ana Tortolero",    cargo: "Finanzas y tesorería",                parentId: "marina" },
  { id: "angelica", nombre: "Angelica Pino",    cargo: "Tesorería y pago a proveedores",      parentId: "ana" },
  { id: "lucas",    nombre: "Lucas Cipolletti", cargo: "Reporting y proveedores",             parentId: "ana" },
  { id: "sabrina",  nombre: "Sabrina Chaves",   cargo: "Administración general",              parentId: "marina" },
  { id: "nehuen",   nombre: "Nehuen Gonzalez",  cargo: "Administración de personal",          parentId: "sabrina" },
  { id: "virginia", nombre: "Virginia Nieto",   cargo: "Control de cajas",                    parentId: "sabrina" },
  { id: "abril",    nombre: "Abril D'angelo",   cargo: "Facturación y cobranzas",             parentId: "sabrina" },
  { id: "daniel",   nombre: "Daniel Barnade",   cargo: "Contabilidad, impuestos y auditoría", parentId: "marina" },
  { id: "evelin",   nombre: "Evelin Fischer",   cargo: "Contabilidad y control de gestión",   parentId: "daniel" },
];

const nuevoId = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const limpiar = (s: unknown) => String(s ?? "").trim();

async function leer(): Promise<NodoOrg[]> {
  const saved = await readStore<NodoOrg[] | null>(KEY, null);
  return Array.isArray(saved) && saved.length ? saved : SEED;
}

export async function getOrganigrama(): Promise<NodoOrg[]> {
  return leer();
}

/** Alta (sin id) o edición (con id) de un nodo. Valida que no se cree un ciclo. */
export async function upsertNodo(
  input: Partial<NodoOrg> & { nombre?: string; cargo?: string }
): Promise<NodoOrg[]> {
  const nodos = [...(await leer())];

  if (input.id) {
    const i = nodos.findIndex((n) => n.id === input.id);
    if (i < 0) throw new Error("No existe ese nodo.");
    // Mover de jefe: no puede colgar de sí mismo ni de un descendiente suyo.
    let parentId = input.parentId !== undefined ? input.parentId : nodos[i].parentId;
    if (parentId === input.id) parentId = nodos[i].parentId;
    if (parentId && descendientes(nodos, input.id).has(parentId)) {
      throw new Error("No se puede mover un nodo dentro de su propia rama.");
    }
    if (parentId && !nodos.some((n) => n.id === parentId)) parentId = null;
    nodos[i] = {
      ...nodos[i],
      ...(input.nombre !== undefined ? { nombre: limpiar(input.nombre) } : {}),
      ...(input.cargo !== undefined ? { cargo: limpiar(input.cargo) } : {}),
      ...(input.email !== undefined ? { email: limpiar(input.email).toLowerCase() || null } : {}),
      parentId,
    };
  } else {
    const nombre = limpiar(input.nombre);
    const cargo = limpiar(input.cargo);
    if (!nombre && !cargo) throw new Error("Poné al menos nombre o cargo.");
    const parentId = input.parentId && nodos.some((n) => n.id === input.parentId) ? input.parentId : null;
    nodos.push({
      id: nuevoId(),
      nombre,
      cargo,
      parentId,
      ...(input.email ? { email: limpiar(input.email).toLowerCase() } : {}),
    });
  }
  await writeStore(KEY, nodos);
  return nodos;
}

/** Borra un nodo. Sus hijos se recuelgan del jefe del nodo borrado (no se pierden). */
export async function removeNodo(id: string): Promise<NodoOrg[]> {
  const nodos = await leer();
  const objetivo = nodos.find((n) => n.id === id);
  if (!objetivo) return nodos;
  const nuevos = nodos
    .filter((n) => n.id !== id)
    .map((n) => (n.parentId === id ? { ...n, parentId: objetivo.parentId } : n));
  await writeStore(KEY, nuevos);
  return nuevos;
}

/** Sube/baja un nodo entre sus hermanos (dir = -1 sube, +1 baja). */
export async function moverNodo(id: string, dir: -1 | 1): Promise<NodoOrg[]> {
  const nodos = [...(await leer())];
  const nodo = nodos.find((n) => n.id === id);
  if (!nodo) return nodos;
  const hermanos = nodos.filter((n) => n.parentId === nodo.parentId);
  const idx = hermanos.findIndex((n) => n.id === id);
  const destino = hermanos[idx + dir];
  if (!destino) return nodos; // ya está en el borde
  // Intercambia posiciones en el array plano (respeta el orden de despliegue).
  const a = nodos.findIndex((n) => n.id === id);
  const b = nodos.findIndex((n) => n.id === destino.id);
  [nodos[a], nodos[b]] = [nodos[b], nodos[a]];
  await writeStore(KEY, nodos);
  return nodos;
}

/** Reemplaza todo el organigrama (import). Valida forma mínima. */
export async function setOrganigrama(nodos: NodoOrg[]): Promise<NodoOrg[]> {
  if (!Array.isArray(nodos)) throw new Error("Formato inválido.");
  const limpios = nodos
    .filter((n) => n && typeof n.id === "string")
    .map((n) => ({
      id: String(n.id),
      nombre: limpiar(n.nombre),
      cargo: limpiar(n.cargo),
      parentId: n.parentId ? String(n.parentId) : null,
      ...(n.email ? { email: limpiar(n.email).toLowerCase() } : {}),
    }));
  await writeStore(KEY, limpios);
  return limpios;
}
