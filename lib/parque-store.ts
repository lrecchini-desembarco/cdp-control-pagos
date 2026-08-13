import { readStore, writeStore } from "./store";
import seed from "./parque-seed.json";
import { estadoInicial, flagsDe, gbDisco, gbRam, type EstadoPC } from "./parque";

// Parque de computadoras (una fila por equipo/usuario).
//
// Tres capas que se combinan en cada lectura:
//   1. seed      -> el relevamiento versionado (lib/parque-seed.json), que regenera
//                   scripts/seed-inventario-pcs.mjs desde el CSV.
//   2. manuales  -> equipos cargados a mano desde la UI (key "parque-manual").
//   3. overrides -> estado y nota editados en la tabla (key "parque-overrides").
//
// Así un relevamiento nuevo actualiza las specs sin pisar lo que se cargó o decidió
// a mano. Las specs derivadas (RAM/disco en GB y las alertas) se recalculan siempre
// con las reglas de lib/parque.ts: no se guardan, se derivan.

export interface EquipoPC {
  id: string;
  nro: number;
  usuario: string;
  area: string;
  tipo: string;
  hostname: string;
  marca: string;
  modelo: string;
  cpu: string;
  ram: string;
  almacenamiento: string;
  gpu: string;
  so: string;
  correo: string;
  observaciones: string;
  ramGb: number;
  discoGb: number;
  flags: string[];
  estado: EstadoPC;
  /** true = cargado a mano desde la UI (se puede quitar; el seed no). */
  manual?: boolean;
  nota?: string;
  actualizado?: string;
}

/** Lo que se guarda de un equipo manual: los campos crudos, sin nada derivado. */
type EquipoCrudo = Omit<EquipoPC, "ramGb" | "discoGb" | "flags" | "estado" | "manual"> & {
  estado?: EstadoPC;
};

type Override = { estado?: EstadoPC; nota?: string; actualizado?: string };

const KEY_MANUAL = "parque-manual";
const KEY_OVERRIDES = "parque-overrides";

const CAMPOS = [
  "usuario", "area", "tipo", "hostname", "marca", "modelo",
  "cpu", "ram", "almacenamiento", "gpu", "so", "correo", "observaciones",
] as const;

const nuevoId = () => `pc-m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const manuales = async () => (await readStore<EquipoCrudo[] | null>(KEY_MANUAL, null)) ?? [];

/** Completa lo derivado (GB, alertas, estado inicial) sobre los campos crudos. */
function completar(eq: EquipoCrudo, manual: boolean): EquipoPC {
  const flags = flagsDe(eq);
  return {
    ...eq,
    ramGb: gbRam(eq.ram),
    discoGb: gbDisco(eq.almacenamiento),
    flags,
    estado: eq.estado ?? estadoInicial(eq, flags),
    ...(manual ? { manual: true } : {}),
  };
}

export async function getParque(): Promise<EquipoPC[]> {
  const overrides = (await readStore<Record<string, Override> | null>(KEY_OVERRIDES, null)) ?? {};
  const todos = [
    ...(seed as EquipoCrudo[]).map((eq) => completar(eq, false)),
    ...(await manuales()).map((eq) => completar(eq, true)),
  ];
  return todos.map((eq) => ({ ...eq, ...overrides[eq.id] })).sort((a, b) => a.nro - b.nro);
}

/** Alta manual de un equipo. Solo se pide el usuario; el resto se completa después. */
export async function addEquipo(input: Record<string, unknown>): Promise<EquipoPC[]> {
  const usuario = String(input.usuario ?? "").trim();
  if (!usuario) throw new Error("Poné al menos el usuario o el puesto.");

  const lista = await manuales();
  const nro = Math.max(0, ...(seed as EquipoCrudo[]).map((e) => e.nro), ...lista.map((e) => e.nro)) + 1;

  const eq = { id: nuevoId(), nro, usuario } as EquipoCrudo;
  for (const c of CAMPOS) eq[c] = c === "usuario" ? usuario : String(input[c] ?? "").trim();
  if (input.estado) eq.estado = input.estado as EstadoPC;
  eq.actualizado = new Date().toISOString();

  await writeStore(KEY_MANUAL, [...lista, eq]);
  return getParque();
}

/** Edición: estado y nota valen para cualquier equipo; el resto solo para los manuales. */
export async function setEquipo(id: string, patch: Record<string, unknown>): Promise<EquipoPC[]> {
  const lista = await manuales();
  const i = lista.findIndex((e) => e.id === id);

  if (i >= 0) {
    const eq = { ...lista[i] };
    for (const c of CAMPOS) if (patch[c] !== undefined) eq[c] = String(patch[c]).trim();
    if (patch.nota !== undefined) eq.nota = String(patch.nota);
    if (patch.estado !== undefined) eq.estado = patch.estado as EstadoPC;
    eq.actualizado = new Date().toISOString();
    lista[i] = eq;
    await writeStore(KEY_MANUAL, lista);
    return getParque();
  }

  if (!(seed as EquipoCrudo[]).some((eq) => eq.id === id)) throw new Error("No existe ese equipo.");
  const overrides = (await readStore<Record<string, Override> | null>(KEY_OVERRIDES, null)) ?? {};
  overrides[id] = {
    ...overrides[id],
    ...(patch.estado !== undefined ? { estado: patch.estado as EstadoPC } : {}),
    ...(patch.nota !== undefined ? { nota: String(patch.nota) } : {}),
    actualizado: new Date().toISOString(),
  };
  await writeStore(KEY_OVERRIDES, overrides);
  return getParque();
}

/** Baja. Solo los cargados a mano; los del relevamiento se sacan del CSV. */
export async function removeEquipo(id: string): Promise<EquipoPC[]> {
  const lista = await manuales();
  if (!lista.some((e) => e.id === id)) throw new Error("Ese equipo viene del relevamiento; no se borra desde acá.");
  await writeStore(KEY_MANUAL, lista.filter((e) => e.id !== id));
  return getParque();
}
