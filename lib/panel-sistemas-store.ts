import { readStore, writeStore } from "./store";
import { EMAILS_PANEL_SISTEMAS_BASE, normEmail } from "./panel-sistemas";

// Emails con acceso al Panel de Sistemas, más allá de la base fija del código.
// Se gestiona desde la propia pantalla ("Quién tiene acceso"): agregar/quitar
// no requiere deploy. Persistido en KV, mismo patrón que credenciales/inventario.

const KEY = "panel-sistemas-emails";

const extras = async (): Promise<string[]> => (await readStore<string[] | null>(KEY, null)) ?? [];

/** Lista para mostrar en la pantalla: base (fija) + extra (removible). */
export async function getAccesoPanel(): Promise<{ base: string[]; extra: string[] }> {
  return { base: EMAILS_PANEL_SISTEMAS_BASE, extra: await extras() };
}

/** ¿Este email puede ver el Panel de Sistemas? Base + lo agregado a mano. */
export async function puedeVerPanelSistemas(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const e = normEmail(String(email));
  if (EMAILS_PANEL_SISTEMAS_BASE.some((x) => normEmail(x) === e)) return true;
  return (await extras()).some((x) => normEmail(x) === e);
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Agrega un email a la lista. Rechaza vacío, formato inválido o ya-tiene-acceso. */
export async function agregarAccesoPanel(email: string): Promise<string[]> {
  const e = normEmail(String(email ?? ""));
  if (!e || !RE_EMAIL.test(e)) throw new Error("Ese email no parece válido.");
  if (EMAILS_PANEL_SISTEMAS_BASE.some((x) => normEmail(x) === e)) {
    throw new Error("Ya tiene acceso (viene fijo en el código).");
  }
  const lista = await extras();
  if (lista.some((x) => normEmail(x) === e)) throw new Error("Ya tiene acceso.");
  const nueva = [...lista, e];
  await writeStore(KEY, nueva);
  return nueva;
}

/** Quita un email agregado a mano. Los de la base no se pueden quitar desde acá. */
export async function quitarAccesoPanel(email: string): Promise<string[]> {
  const e = normEmail(String(email ?? ""));
  if (EMAILS_PANEL_SISTEMAS_BASE.some((x) => normEmail(x) === e)) {
    throw new Error("Ese acceso es fijo del código; no se puede quitar desde acá.");
  }
  const nueva = (await extras()).filter((x) => normEmail(x) !== e);
  await writeStore(KEY, nueva);
  return nueva;
}
