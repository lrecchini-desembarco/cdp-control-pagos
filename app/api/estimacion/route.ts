import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { sesionPuedeVer } from "@/lib/roles-store";
import { readStore, writeStore } from "@/lib/store";
import { getSources } from "@/lib/sources";
import { getRecetas } from "@/lib/recetas-store";
import { getInsumos } from "@/lib/insumos-store";
import { estimarInsumos, type ResumenEstimacion } from "@/lib/estimacion";
import { getRecetasTango } from "@/lib/sources/tango";
import { agruparRecetasTango } from "@/lib/recetas-tango";
import { recentDates } from "@/lib/catalogo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TTL_MS = 6 * 60 * 60 * 1000;
const key = (hoy: string, h: number, suc: string) => `estimacion-cache-${hoy}-${h}-${suc || "all"}`;
type Cacheado = { ts: number; resumen: ResumenEstimacion };

// GET /api/estimacion?dias=7&sucursal= -> insumos estimados para el horizonte.
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!(await sesionPuedeVer(s, "/estimacion"))) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const horizonte = Math.min(Math.max(Number(req.nextUrl.searchParams.get("dias")) || 7, 1), 30);
  const sucursal = req.nextUrl.searchParams.get("sucursal") ?? "";
  const dates = recentDates(60);
  const hoy = dates[0];
  const desde = dates[dates.length - 1];

  const k = key(hoy, horizonte, sucursal);
  const cache = await readStore<Cacheado | null>(k, null);
  if (cache && Date.now() - cache.ts < TTL_MS) return NextResponse.json({ ok: true, cacheado: true, ...cache.resumen });
  try {
    const [ventas, recetas, insumos, filasTango] = await Promise.all([
      getSources().ventas.getVentas({ desde, hasta: hoy }),
      getRecetas(),
      getInsumos(),
      getRecetasTango().catch(() => [] as Awaited<ReturnType<typeof getRecetasTango>>),
    ]);
    const resumen = estimarInsumos(ventas, recetas, insumos, { horizonteDias: horizonte, hoy, sucursal: sucursal || undefined });
    // Marcar los "sin receta" que SÍ tienen receta en el recetario de Tango (falta el costo).
    const skusRecetaTango = new Set(agruparRecetasTango(filasTango as any).map((r) => String(r.sku)));
    for (const it of resumen.sinReceta) it.recetaTango = skusRecetaTango.has(String(it.sku));
    await writeStore(k, { ts: Date.now(), resumen } as Cacheado);
    return NextResponse.json({ ok: true, cacheado: false, ...resumen });
  } catch (e) {
    if (cache) return NextResponse.json({ ok: true, cacheado: true, stale: true, ...cache.resumen });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo estimar." }, { status: 502 });
  }
}
