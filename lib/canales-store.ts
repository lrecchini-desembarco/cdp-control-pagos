import { readStore, writeStore } from "./store";
import { CANALES_DEFAULT, type Canal } from "./canales";

// Config editable de comisiones por canal (plataforma). KV en prod; si está vacío,
// usa los defaults del documento. Clave = id de canal.

const KEY = "canales";

export async function getCanales(): Promise<Canal[]> {
  const g = await readStore<Canal[] | null>(KEY, null);
  return g && g.length ? g : CANALES_DEFAULT;
}

export async function updateCanal(id: string, patch: Partial<Canal>): Promise<Canal[]> {
  const canales = (await readStore<Canal[] | null>(KEY, null)) ?? CANALES_DEFAULT.map((c) => ({ ...c }));
  const i = canales.findIndex((c) => c.id === id);
  if (i < 0) throw new Error("Canal no encontrado.");
  const num = (v: unknown, d: number) => (v === undefined ? d : Math.max(0, Number(v) || 0));
  canales[i] = {
    ...canales[i],
    comisionPct: num(patch.comisionPct, canales[i].comisionPct),
    pagoOnlinePct: num(patch.pagoOnlinePct, canales[i].pagoOnlinePct),
    enviosPct: num(patch.enviosPct, canales[i].enviosPct),
    publicidadPct: num(patch.publicidadPct, canales[i].publicidadPct),
    nombre: patch.nombre ?? canales[i].nombre,
  };
  await writeStore(KEY, canales);
  return getCanales();
}
