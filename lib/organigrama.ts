// Organigrama: árbol de personas/áreas. Modelo plano (cada nodo con parentId) para
// que sea fácil de editar y escalar (agregar, mover de jefe, borrar). Se arma el
// árbol al vuelo. Cada nodo puede tener un email para resaltar "vos estás acá".

export interface NodoOrg {
  id: string;
  nombre: string;          // persona (ej. "Marina Fernandez")
  cargo: string;           // área / puesto (ej. "Administración y finanzas")
  parentId: string | null; // jefe directo; null = raíz
  email?: string | null;   // para ubicar al usuario logueado
}

export interface NodoArbol extends NodoOrg {
  hijos: NodoArbol[];
  nivel: number;
}

/** Arma el/los árbol(es) a partir de la lista plana. */
export function construirArbol(nodos: NodoOrg[]): NodoArbol[] {
  const map = new Map<string, NodoArbol>();
  for (const n of nodos) map.set(n.id, { ...n, hijos: [], nivel: 0 });
  const raices: NodoArbol[] = [];
  for (const n of Array.from(map.values())) {
    if (n.parentId && map.has(n.parentId)) map.get(n.parentId)!.hijos.push(n);
    else raices.push(n);
  }
  // El orden de despliegue es el del array (lo maneja el usuario con subir/bajar),
  // no un orden alfabético: es más intuitivo y estable.
  const marcarNivel = (arr: NodoArbol[], nivel: number) => {
    for (const x of arr) { x.nivel = nivel; marcarNivel(x.hijos, nivel + 1); }
  };
  marcarNivel(raices, 0);
  return raices;
}

/** Camino desde la raíz hasta el nodo (para el "estás acá / tu línea de reporte"). */
export function caminoAlRaiz(nodos: NodoOrg[], id: string): NodoOrg[] {
  const byId = new Map(nodos.map((n) => [n.id, n]));
  const out: NodoOrg[] = [];
  let cur = byId.get(id);
  const visto = new Set<string>();
  while (cur && !visto.has(cur.id)) {
    visto.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** Todos los descendientes de un nodo (para no permitir moverlo a su propia rama). */
export function descendientes(nodos: NodoOrg[], id: string): Set<string> {
  const hijosDe = new Map<string, string[]>();
  for (const n of nodos) {
    if (n.parentId) (hijosDe.get(n.parentId) ?? hijosDe.set(n.parentId, []).get(n.parentId)!).push(n.id);
  }
  const out = new Set<string>();
  const rec = (x: string) => { for (const h of hijosDe.get(x) ?? []) if (!out.has(h)) { out.add(h); rec(h); } };
  rec(id);
  return out;
}

/** Ubica al usuario logueado por email (case-insensitive). */
export function nodoDeEmail(nodos: NodoOrg[], email?: string): NodoOrg | undefined {
  if (!email) return undefined;
  const e = email.trim().toLowerCase();
  return nodos.find((n) => (n.email ?? "").trim().toLowerCase() === e);
}
