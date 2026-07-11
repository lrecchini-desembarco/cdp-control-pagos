import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/api-guard";
import { readStore, writeStore } from "@/lib/store";
import { PROPIAS, cuitValido, type BaseEntry } from "@/lib/bancos";

export const dynamic = "force-dynamic";

// Base CUIT->{nombre,tipo} de clientes/proveedores cargada por el usuario (las propias
// vienen del seed en lib/bancos). Se guarda en KV `bancos-bases`.
const KEY = "bancos-bases";

async function leer(): Promise<Record<string, BaseEntry>> {
  return (await readStore<Record<string, BaseEntry> | null>(KEY, null)) ?? {};
}
function conteo(b: Record<string, BaseEntry>) {
  let cliente = 0, proveedor = 0;
  for (const e of Object.values(b)) {
    if (e.tipo === "cliente" || e.tipo === "ambos") cliente++;
    if (e.tipo === "proveedor" || e.tipo === "ambos") proveedor++;
  }
  return { cliente, proveedor, propias: Object.keys(PROPIAS).length };
}

// GET -> cuántas entradas hay por tipo.
export async function GET() {
  const g = await guard("/bancos");
  if ("res" in g) return g.res;
  return NextResponse.json({ ok: true, conteo: conteo(await leer()) });
}

// POST { entries: {cuit,nombre,tipo}[], reemplazarTipo? } -> mergea las entradas.
// Si reemplazarTipo viene, primero borra todas las de ese tipo (re-cargar la base).
export async function POST(req: NextRequest) {
  const g = await guard("/bancos");
  if ("res" in g) return g.res;
  try {
    const body = (await req.json()) as { entries?: { cuit: string; nombre: string; tipo: BaseEntry["tipo"] }[]; reemplazarTipo?: BaseEntry["tipo"] };
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) return NextResponse.json({ ok: false, error: "sin entradas (¿encontré las columnas CUIT y Nombre?)" }, { status: 400 });
    let base = await leer();
    if (body.reemplazarTipo) base = Object.fromEntries(Object.entries(base).filter(([, e]) => e.tipo !== body.reemplazarTipo));
    for (const e of entries) {
      const cuit = String(e.cuit || "").replace(/[^0-9]/g, "");
      if (!cuitValido(cuit) || !e.nombre) continue;
      const prev = base[cuit];
      // Si el CUIT ya estaba como el OTRO tipo (cliente y proveedor) -> "ambos".
      const tipo: BaseEntry["tipo"] = prev && prev.tipo !== "propia" && prev.tipo !== e.tipo ? "ambos" : e.tipo;
      base[cuit] = { nombre: prev?.nombre || String(e.nombre).slice(0, 80), tipo };
    }
    await writeStore(KEY, base);
    return NextResponse.json({ ok: true, conteo: conteo(base) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "no se pudo guardar" }, { status: 500 });
  }
}

// DELETE ?tipo=cliente|proveedor -> borra las de ese tipo (o todas si no viene).
export async function DELETE(req: NextRequest) {
  const g = await guard("/bancos");
  if ("res" in g) return g.res;
  const tipo = req.nextUrl.searchParams.get("tipo");
  const base = await leer();
  const nueva = tipo ? Object.fromEntries(Object.entries(base).filter(([, e]) => e.tipo !== tipo)) : {};
  await writeStore(KEY, nueva);
  return NextResponse.json({ ok: true, conteo: conteo(nueva) });
}
