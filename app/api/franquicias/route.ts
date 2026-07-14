import { NextRequest, NextResponse } from "next/server";
import { gzipSync, gunzipSync } from "zlib";
import { guard } from "@/lib/api-guard";
import { readStore, writeStore } from "@/lib/store";
import { PARAMS_DEFAULT, type FacturaCC, type ParamsCC } from "@/lib/franquicias";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cuentas Corrientes de Franquicias. Se guarda el SNAPSHOT completo de facturas
// pendientes (cada subida reemplaza — es una foto al día) + los parámetros de cálculo.
// El cliente recalcula en vivo con lib/franquicias (así tocar un parámetro es instantáneo).
const KEY = "franquicias-facturas";
const PKEY = "franquicias-params";
const META = "franquicias-meta";
const pack = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o), "utf8")).toString("base64");
const unpack = <T,>(s: string): T => JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8")) as T;

async function leer(): Promise<FacturaCC[]> {
  const packed = await readStore<string | null>(KEY, null);
  return packed ? unpack<FacturaCC[]>(packed) : [];
}
async function leerParams(): Promise<ParamsCC> {
  const p = await readStore<ParamsCC | null>(PKEY, null);
  return { ...PARAMS_DEFAULT, ...(p ?? {}) };
}

export async function GET() {
  const g = await guard("/franquicias");
  if ("res" in g) return g.res;
  const [facturas, params, meta] = await Promise.all([
    leer(), leerParams(), readStore<{ actualizado?: string; corte?: string } | null>(META, null),
  ]);
  return NextResponse.json({ ok: true, facturas, params, meta });
}

// POST { facturas } -> reemplaza el snapshot · { params } -> guarda parámetros.
export async function POST(req: NextRequest) {
  const g = await guard("/franquicias");
  if ("res" in g) return g.res;
  try {
    const body = await req.json();
    if (Array.isArray(body.facturas)) {
      await writeStore(KEY, pack(body.facturas));
      await writeStore(META, { actualizado: new Date().toISOString(), corte: body.corte ?? "", total: body.facturas.length });
      return NextResponse.json({ ok: true, total: body.facturas.length });
    }
    if (body.params && typeof body.params === "object") {
      const p: ParamsCC = { ...PARAMS_DEFAULT, ...body.params };
      await writeStore(PKEY, p);
      return NextResponse.json({ ok: true, params: p });
    }
    return NextResponse.json({ ok: false, error: "payload inválido (falta facturas o params)" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function DELETE() {
  const g = await guard("/franquicias");
  if ("res" in g) return g.res;
  await writeStore(KEY, pack([]));
  await writeStore(META, { actualizado: new Date().toISOString(), total: 0 });
  return NextResponse.json({ ok: true });
}
