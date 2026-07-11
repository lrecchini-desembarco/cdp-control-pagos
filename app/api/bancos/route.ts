import { NextRequest, NextResponse } from "next/server";
import { gzipSync, gunzipSync } from "zlib";
import { guard } from "@/lib/api-guard";
import { readStore, writeStore } from "@/lib/store";
import { resumirBancos, claveOrigen, type MovBanco } from "@/lib/bancos";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Movimientos bancarios consolidados, persistidos en KV (comprimidos). Re-subir un
// (banco+local+mes) reemplaza esos movimientos (no duplica). Ver lib/bancos.
const KEY = "bancos-movs";
const META = "bancos-meta";
const pack = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o), "utf8")).toString("base64");
const unpack = <T,>(s: string): T => JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8")) as T;

async function leer(): Promise<MovBanco[]> {
  const packed = await readStore<string | null>(KEY, null);
  return packed ? unpack<MovBanco[]>(packed) : [];
}
// Cobertura: qué (banco, local, mes) hay cargado y cuántos movimientos.
function cobertura(movs: MovBanco[]) {
  const mp = new Map<string, number>();
  for (const m of movs) mp.set(`${m.banco}|${m.local}|${m.mes}`, (mp.get(`${m.banco}|${m.local}|${m.mes}`) ?? 0) + 1);
  return Array.from(mp.entries()).map(([k, n]) => { const [banco, local, mes] = k.split("|"); return { banco, local, mes, n }; })
    .sort((a, b) => a.banco.localeCompare(b.banco) || a.local.localeCompare(b.local) || a.mes.localeCompare(b.mes));
}

// GET -> resumen + cobertura de lo guardado.
export async function GET() {
  const g = await guard("/bancos");
  if ("res" in g) return g.res;
  const movs = await leer();
  const meta = await readStore<{ actualizado?: string } | null>(META, null);
  return NextResponse.json({ ok: true, resumen: resumirBancos(movs), cobertura: cobertura(movs), meta });
}

// POST { movs, fecha? } -> mergea un lote (reemplaza los banco+local+mes que trae).
export async function POST(req: NextRequest) {
  const g = await guard("/bancos");
  if ("res" in g) return g.res;
  try {
    const body = (await req.json()) as { movs?: MovBanco[]; fecha?: string };
    const nuevos = Array.isArray(body.movs) ? body.movs : [];
    if (!nuevos.length) return NextResponse.json({ ok: false, error: "sin movimientos" }, { status: 400 });
    const claves = new Set(nuevos.map(claveOrigen));
    const existentes = (await leer()).filter((m) => !claves.has(claveOrigen(m)));
    const merged = existentes.concat(nuevos);
    await writeStore(KEY, pack(merged));
    await writeStore(META, { actualizado: body.fecha || new Date().toISOString(), total: merged.length });
    return NextResponse.json({ ok: true, resumen: resumirBancos(merged), cobertura: cobertura(merged), total: merged.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "no se pudo guardar" }, { status: 500 });
  }
}

// DELETE -> borra todo lo guardado (para empezar de cero).
export async function DELETE() {
  const g = await guard("/bancos");
  if ("res" in g) return g.res;
  await writeStore(KEY, pack([]));
  await writeStore(META, { actualizado: new Date().toISOString(), total: 0 });
  return NextResponse.json({ ok: true });
}
