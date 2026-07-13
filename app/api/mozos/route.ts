import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { sesionPuedeVer } from "@/lib/roles-store";
import { readStore, writeStore } from "@/lib/store";
import { getMozos, getSucursalesMap } from "@/lib/sources/tango";
import { resumirMozos, type ResumenMozos } from "@/lib/mozos";
import { rangoActividad } from "@/lib/actividad";
import { recentDates } from "@/lib/catalogo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TTL_MS = 6 * 60 * 60 * 1000;
const cacheKey = (desde: string, hasta: string) => `mozos-cache-v2-${desde}_${hasta}`;
type Cacheado = { ts: number; resumen: ResumenMozos };

// GET /api/mozos?dias=N | ?desde&hasta -> ranking de mozos (ventas + ticket promedio).
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!(await sesionPuedeVer(s, "/mozos"))) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const dias = Number(req.nextUrl.searchParams.get("dias"));
  const def = rangoActividad();
  let desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  let hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  if (dias > 0 && dias <= 120) { const f = recentDates(dias); desde = f[f.length - 1]; hasta = f[0]; }

  const key = cacheKey(desde, hasta);
  const cache = await readStore<Cacheado | null>(key, null);
  if (cache && Date.now() - cache.ts < TTL_MS) return NextResponse.json({ ok: true, cacheado: true, ...cache.resumen });
  try {
    const [rows, nombres] = await Promise.all([getMozos({ desde, hasta }), getSucursalesMap()]);
    const resumen = resumirMozos(rows, desde, hasta, nombres);
    await writeStore(key, { ts: Date.now(), resumen } as Cacheado);
    return NextResponse.json({ ok: true, cacheado: false, ...resumen });
  } catch (e) {
    if (cache) return NextResponse.json({ ok: true, cacheado: true, stale: true, ...cache.resumen });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudieron traer los mozos." }, { status: 502 });
  }
}
