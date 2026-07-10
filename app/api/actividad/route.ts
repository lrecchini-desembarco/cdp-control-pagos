import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { sesionPuedeVer } from "@/lib/roles-store";
import { getRankingLocales, getProductosDormidos, rangoActividad } from "@/lib/actividad";
import { dataSourceName, ventasSourceName, preciosSourceName } from "@/lib/sources";

export const dynamic = "force-dynamic";

// GET /api/actividad?desde&hasta&umbral -> ranking de locales + productos dormidos
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!(await sesionPuedeVer(s, "/actividad"))) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }

  const def = rangoActividad();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  const umbral = Math.max(1, Number(req.nextUrl.searchParams.get("umbral")) || 21);

  try {
    // Los dos análisis en paralelo (fuentes distintas: ventas y precios).
    const [ranking, dormidos] = await Promise.all([
      getRankingLocales({ desde, hasta }),
      getProductosDormidos(umbral),
    ]);
    return NextResponse.json({ ok: true, source: dataSourceName(), ventasSource: ventasSourceName(), preciosSource: preciosSourceName(), ranking, dormidos });
  } catch (e) {
    return NextResponse.json(
      { ok: false, source: dataSourceName(), error: e instanceof Error ? e.message : "No se pudo leer la actividad." },
      { status: 502 }
    );
  }
}
