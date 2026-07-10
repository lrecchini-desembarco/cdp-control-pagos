import { NextRequest, NextResponse } from "next/server";
import { getVentasPorSucursal } from "@/lib/ventas";
import { rangoPorDefecto } from "@/lib/cruce";
import { ventasSourceName } from "@/lib/sources";
import { guard } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// GET /api/ventas/sucursales?desde&hasta -> unidades vendidas por sucursal (para auditar cobertura)
export async function GET(req: NextRequest) {
  const g = await guard("/ventas");
  if ("res" in g) return g.res;
  const def = rangoPorDefecto();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  try {
    const sucursales = await getVentasPorSucursal({ desde, hasta });
    return NextResponse.json({ ok: true, source: ventasSourceName(), desde, hasta, sucursales });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudieron leer las ventas." },
      { status: 502 }
    );
  }
}
