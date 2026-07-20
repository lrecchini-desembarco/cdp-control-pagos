import { readStore, writeStore } from "./store";
import { CONFIG_DEFAULT, type BienvenidaConfig, type NuevoIngreso } from "./nuevos-ingresos";

// Persistencia de nuevos ingresos + la config de la tarjeta. KV en prod; si está
// vacío, lista vacía / config por defecto. Claves: "nuevos-ingresos" y "bienvenida-config".

const KEY = "nuevos-ingresos";
const KEY_CFG = "bienvenida-config";

const leer = async () => (await readStore<NuevoIngreso[] | null>(KEY, null)) ?? [];

export async function listarIngresos(): Promise<NuevoIngreso[]> {
  return [...(await leer())].sort((a, b) => b.creado.localeCompare(a.creado));
}

/** Alta o edición de un ingreso (clave = id). */
export async function guardarIngreso(ingreso: NuevoIngreso): Promise<NuevoIngreso[]> {
  const lista = await leer();
  const i = lista.findIndex((x) => x.id === ingreso.id);
  if (i >= 0) lista[i] = ingreso;
  else lista.push(ingreso);
  await writeStore(KEY, lista);
  return listarIngresos();
}

export async function eliminarIngreso(id: string): Promise<NuevoIngreso[]> {
  const lista = (await leer()).filter((x) => x.id !== id);
  await writeStore(KEY, lista);
  return listarIngresos();
}

export async function getConfig(): Promise<BienvenidaConfig> {
  const c = await readStore<BienvenidaConfig | null>(KEY_CFG, null);
  return { ...CONFIG_DEFAULT, ...(c ?? {}) };
}

export async function setConfig(patch: Partial<BienvenidaConfig>): Promise<BienvenidaConfig> {
  const actual = await getConfig();
  const next: BienvenidaConfig = {
    empresa: String(patch.empresa ?? actual.empresa).trim() || CONFIG_DEFAULT.empresa,
    texto: String(patch.texto ?? actual.texto).trim() || CONFIG_DEFAULT.texto,
  };
  await writeStore(KEY_CFG, next);
  return next;
}
