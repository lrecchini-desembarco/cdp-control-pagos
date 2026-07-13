import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { sesionPuedeVer } from "@/lib/roles-store";
import { readStore, writeStore } from "@/lib/store";
import { getAnulados, getSucursalesMap } from "@/lib/sources/tango";
import { resumirAnulados, type ResumenAnulados } from "@/lib/anulados";
import { rangoActividad } from "@/lib/actividad";
import { recentDates } from "@/lib/catalogo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TTL_MS = 6 * 60 * 60 * 1000;
const cacheKey = (desde: string, hasta: string) => `anulados-cache-v1-${desde}_${hasta}`;
type Cacheado = { ts: number; resumen: ResumenAnulados };

// GET /api/anulados?dias=N | ?desde&hasta -> anulados/devoluciones/invitaciones.
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!(await sesionPuedeVer(s, "/anulados"))) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const dias = Number(req.nextUrl.searchParams.get("dias"));
  const def = rangoActividad();
  let desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  let hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  if (dias > 0 && dias <= 120) { const f = recentDates(dias); desde = f[f.length - 1]; hasta = f[0]; }

  const key = cacheKey(desde, hasta);
  const cache = await readStore<Cacheado | null>(key, null);
  if (cache && Date.now() - cache.ts < TTL_MS) return NextResponse.json({ ok: true, cacheado: true, ...cache.resumen });
  try {
    const [rows, nombres] = await Promise.all([getAnulados({ desde, hasta }), getSucursalesMap()]);
    const resumen = resumirAnulados(rows, desde, hasta, nombres);
    await writeStore(key, { ts: Date.now(), resumen } as Cacheado);
    return NextResponse.json({ ok: true, cacheado: false, ...resumen });
  } catch (e) {
    if (cache) return NextResponse.json({ ok: true, cacheado: true, stale: true, ...cache.resumen });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudieron traer los anulados." }, { status: 502 });
  }
}
