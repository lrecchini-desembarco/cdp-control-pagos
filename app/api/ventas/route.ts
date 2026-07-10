import { NextRequest, NextResponse } from "next/server";
import { getVentasPorTurno } from "@/lib/ventas";
import { rangoPorDefecto } from "@/lib/cruce";
import { dataSourceName } from "@/lib/sources";
import { guard } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// GET /api/ventas?desde&hasta&sucursal&marca -> ventas por artículo y turno
export async function GET(req: NextRequest) {
  const g = await guard("/ventas");
  if ("res" in g) return g.res;
  const def = rangoPorDefecto();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  const sucursal = req.nextUrl.searchParams.get("sucursal") ?? undefined;
  const marca = req.nextUrl.searchParams.get("marca") ?? undefined;
  try {
    const data = await getVentasPorTurno({ desde, hasta }, { sucursal, marca });
    return NextResponse.json({ ok: true, source: dataSourceName(), desde, hasta, ...data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, source: dataSourceName(), error: e instanceof Error ? e.message : "No se pudieron leer las ventas." },
      { status: 502 }
    );
  }
}
