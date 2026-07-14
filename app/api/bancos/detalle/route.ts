import { NextRequest, NextResponse } from "next/server";
import { gunzipSync } from "zlib";
import { guard } from "@/lib/api-guard";
import { readStore } from "@/lib/store";
import { type MovBanco } from "@/lib/bancos";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KEY = "bancos-movs";
const unpack = <T,>(s: string): T => JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8")) as T;

async function leer(): Promise<MovBanco[]> {
  const packed = await readStore<string | null>(KEY, null);
  return packed ? unpack<MovBanco[]>(packed) : [];
}

// Detalle: movimientos crudos del filtro (para drill-down y export/conciliación).
// GET ?mes=&banco=&local=&cuit=&q=&limit=&offset=&orden=
export async function GET(req: NextRequest) {
  const g = await guard("/bancos");
  if ("res" in g) return g.res;
  const p = req.nextUrl.searchParams;
  const mes = p.get("mes") || "";
  const banco = p.get("banco") || "";
  const local = p.get("local") || "";
  const cuit = (p.get("cuit") || "").replace(/[^0-9]/g, "");
  const q = (p.get("q") || "").toLowerCase().trim();
  const limit = Math.min(Math.max(Number(p.get("limit")) || 200, 1), 20000);
  const offset = Math.max(Number(p.get("offset")) || 0, 0);

  const all = await leer();
  const filt = all.filter((m) =>
    (!mes || m.mes === mes) && (!banco || m.banco === banco) && (!local || m.local === local) &&
    (!cuit || m.cuit === cuit) && (!q || (m.concepto || "").toLowerCase().includes(q)));
  // Más recientes primero.
  filt.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  const suma = filt.reduce((s, m) => ({ ingresos: s.ingresos + m.ingreso, egresos: s.egresos + m.egreso }), { ingresos: 0, egresos: 0 });
  return NextResponse.json({
    ok: true,
    total: filt.length,
    suma,
    movs: filt.slice(offset, offset + limit),
  });
}
