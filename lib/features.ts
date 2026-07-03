import { readStore, writeStore } from "./store";

// Panel de funcionalidades: el usuario activa/pide features desde su dashboard y
// las maneja (agregar/quitar) cuando quiera. Las "disponible" se activan al toque;
// las "proximamente" quedan registradas como pedido (el equipo las construye).

export interface Feature {
  key: string;
  nombre: string;
  desc: string;
  estado: "disponible" | "proximamente";
}

export const FEATURES: Feature[] = [
  { key: "cobertura", nombre: "Cobertura %", desc: "Qué % de los propios y de las franquicias pidió al CDP en el período.", estado: "disponible" },
  { key: "dinero_riesgo", nombre: "$ en riesgo", desc: "El monto en $ de lo pedido que no se vendió. Necesita los costos unitarios confirmados.", estado: "proximamente" },
  { key: "comparar_periodos", nombre: "Comparar 2 períodos", desc: "Ver si subió o bajó el pedido de cada local entre dos rangos de fechas (tendencia).", estado: "proximamente" },
  { key: "alertas", nombre: "Alertas automáticas", desc: "Avisar cuando un local venía pidiendo y deja de vender (o al revés).", estado: "proximamente" },
];

type Prefs = Record<string, Record<string, boolean>>; // email -> { featureKey: true }
const KEY = "features_prefs";

export async function getPrefs(email: string): Promise<Record<string, boolean>> {
  const all = (await readStore<Prefs | null>(KEY, null)) ?? {};
  return all[email] ?? {};
}

export async function setPref(email: string, feature: string, on: boolean): Promise<Record<string, boolean>> {
  const all = (await readStore<Prefs | null>(KEY, null)) ?? {};
  const mine = { ...(all[email] ?? {}) };
  if (on) mine[feature] = true;
  else delete mine[feature];
  all[email] = mine;
  await writeStore(KEY, all);
  return mine;
}

/** Todo lo pedido/activado por todos (para que admin vea la demanda). */
export async function getAllPrefs(): Promise<Prefs> {
  return (await readStore<Prefs | null>(KEY, null)) ?? {};
}
