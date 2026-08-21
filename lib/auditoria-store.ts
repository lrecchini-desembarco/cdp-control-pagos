import { readStore, writeStore } from "./store";

// Bitácora de accesos a datos sensibles (server-only).
//
// Deja registrado QUIÉN reveló o copió QUÉ y CUÁNDO. No guarda el valor: solo el
// id y el nombre de lo que se pidió — la bitácora nunca puede filtrar un secreto.
// Es append-only con tope: se conservan los últimos MAX eventos.

export type AccionAuditada = "revelar" | "copiar";

export interface EventoAuditoria {
  fecha: string;      // ISO
  email: string;      // quién
  accion: AccionAuditada;
  recurso: string;    // id del acceso/credencial
  detalle?: string;   // nombre legible (nunca el valor)
}

const KEY = "auditoria-accesos";
const MAX = 500;

export async function registrar(ev: Omit<EventoAuditoria, "fecha">): Promise<void> {
  try {
    const previos = (await readStore<EventoAuditoria[] | null>(KEY, null)) ?? [];
    const lista = [{ ...ev, fecha: new Date().toISOString() }, ...previos].slice(0, MAX);
    await writeStore(KEY, lista);
  } catch {
    // La bitácora no puede romper la operación: si el store falla, se sigue.
  }
}

/** Últimos eventos, más nuevo primero. */
export async function getAuditoria(limite = 100): Promise<EventoAuditoria[]> {
  const lista = (await readStore<EventoAuditoria[] | null>(KEY, null)) ?? [];
  return lista.slice(0, limite);
}
