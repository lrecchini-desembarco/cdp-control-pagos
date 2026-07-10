import { NextRequest, NextResponse } from "next/server";
import { getCruce, rangoPorDefecto } from "@/lib/cruce";
import { dataSourceName, pedidosSourceName, ventasSourceName } from "@/lib/sources";
import { guard } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// GET /api/cruce?desde=2026-06-23&hasta=2026-06-29
export async function GET(req: NextRequest) {
  const g = await guard("/cruce");
  if ("res" in g) return g.res;
  const def = rangoPorDefecto();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  try {
    const data = await getCruce({ desde, hasta });
    return NextResponse.json({
      ok: true,
      source: dataSourceName(),
      pedidosSource: pedidosSourceName(),
      ventasSource: ventasSourceName(),
      desde,
      hasta,
      data,
    });
  } catch (e) {
    console.error("[cruce] error:", e);
    return NextResponse.json(
      {
        ok: false,
        source: dataSourceName(),
        error:
          e instanceof Error
            ? e.message
            : "No se pudo construir el cruce desde las fuentes de datos.",
      },
      { status: 502 }
    );
  }
}
