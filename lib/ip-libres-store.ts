import { readStore, writeStore } from "./store";
import type { IpEntry } from "./ip-libres";

// IPs de la red: se cargan importando el CSV del script de escaneo de sistemas,
// y se van tildando a mano como "en uso". CRUD simple persistido (KV en prod),
// mismo patrón que credenciales/inventario. Solo lo maneja el admin.

const KEY = "ip-libres";

const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const todas = async (): Promise<IpEntry[]> => (await readStore<IpEntry[] | null>(KEY, null)) ?? [];

export async function getIps(): Promise<IpEntry[]> {
  return (await todas()).sort((a, b) => {
    // orden numérico por octeto, no alfabético (si no, 10.0.0.9 queda antes de 10.0.0.10)
    const oa = a.ip.split(".").map(Number);
    const ob = b.ip.split(".").map(Number);
    for (let i = 0; i < 4; i++) if (oa[i] !== ob[i]) return (oa[i] ?? 0) - (ob[i] ?? 0);
    return 0;
  });
}

/**
 * Importación masiva desde el CSV. Las IPs nuevas entran como libres; las que
 * ya estaban NO pisan su "usada" ni su nota (es trabajo manual de sistemas,
 * un reimport no lo tiene que borrar) — solo se actualiza que se la volvió a
 * ver y, si el CSV trae red, se refresca ese dato.
 */
export async function importarIps(
  entradas: Array<{ ip: string; red?: string }>,
  email: string
): Promise<{ items: IpEntry[]; nuevas: number; actualizadas: number }> {
  if (!Array.isArray(entradas) || entradas.length === 0) throw new Error("No hay filas para importar.");
  if (entradas.length > 2000) throw new Error("Demasiadas filas (máximo 2000 por archivo).");

  const lista = await todas();
  const porIp = new Map(lista.map((e, i) => [e.ip, i]));
  const ahora = new Date().toISOString();

  let nuevas = 0;
  let actualizadas = 0;
  for (const e of entradas) {
    const ip = String(e.ip ?? "").trim();
    if (!ip) continue;
    const red = e.red ? String(e.red).trim() : undefined;
    const i = porIp.get(ip);
    if (i === undefined) {
      porIp.set(ip, lista.length);
      lista.push({
        id: nuevoId(),
        ip,
        ...(red ? { red } : {}),
        usada: false,
        vistaEn: ahora,
        actualizado: ahora,
        actualizadoPor: email,
      });
      nuevas++;
    } else {
      lista[i] = { ...lista[i], ...(red ? { red } : {}), vistaEn: ahora };
      actualizadas++;
    }
  }

  await writeStore(KEY, lista);
  return { items: await getIps(), nuevas, actualizadas };
}

/** Tildar/destildar "en uso", o cambiar la nota de una IP puntual. */
export async function editarIp(
  id: string,
  patch: { usada?: boolean; nota?: string },
  email: string
): Promise<IpEntry[]> {
  const lista = await todas();
  const i = lista.findIndex((e) => e.id === id);
  if (i < 0) throw new Error("No existe esa IP.");
  lista[i] = {
    ...lista[i],
    ...(patch.usada !== undefined ? { usada: patch.usada } : {}),
    ...(patch.nota !== undefined ? { nota: patch.nota } : {}),
    actualizado: new Date().toISOString(),
    actualizadoPor: email,
  };
  await writeStore(KEY, lista);
  return getIps();
}

export async function removeIp(id: string): Promise<IpEntry[]> {
  const lista = (await todas()).filter((e) => e.id !== id);
  await writeStore(KEY, lista);
  return getIps();
}
