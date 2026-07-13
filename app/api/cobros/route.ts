import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { sesionPuedeVer } from "@/lib/roles-store";
import { readStore, writeStore } from "@/lib/store";
import { getCobros } from "@/lib/sources/tango";
import { resumirCobros, type ResumenCobros } from "@/lib/cobros";
import { rangoActividad } from "@/lib/actividad";
import { recentDates } from "@/lib/catalogo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cache liviano en KV: la data de cobros no cambia dentro del día y traerla del
// bridge (túnel) es lento. Guardamos el resumen por rango, con TTL de 6h; si el
// bridge falla, servimos lo último bueno.
const TTL_MS = 6 * 60 * 60 * 1000;
const cacheKey = (desde: string, hasta: string) => `cobros-cache-${desde}_${hasta}`;
type Cacheado = { ts: number; resumen: ResumenCobros };

// GET /api/cobros?dias=N | ?desde&hasta -> resumen de cobros por medio de pago (grupo).
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!(await sesionPuedeVer(s, "/cobros"))) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const dias = Number(req.nextUrl.searchParams.get("dias"));
  const def = rangoActividad();
  let desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  let hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  if (dias > 0 && dias <= 120) { const f = recentDates(dias); desde = f[f.length - 1]; hasta = f[0]; }

  const key = cacheKey(desde, hasta);
  const cache = await readStore<Cacheado | null>(key, null);
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return NextResponse.json({ ok: true, cacheado: true, ...cache.resumen });
  }
  try {
    const cobros = await getCobros({ desde, hasta });
    const resumen = resumirCobros(cobros, desde, hasta);
    await writeStore(key, { ts: Date.now(), resumen } as Cacheado);
    return NextResponse.json({ ok: true, cacheado: false, ...resumen });
  } catch (e) {
    if (cache) return NextResponse.json({ ok: true, cacheado: true, stale: true, ...cache.resumen }); // respaldo
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudieron traer los cobros." }, { status: 502 });
  }
}
