import { NextRequest, NextResponse } from "next/server";
import { getComparativoPorLocal } from "@/lib/pedidos";
import { rangoPorDefecto } from "@/lib/cruce";
import { guard } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// GET /api/pedidos?desde&hasta -> comparativo CDP (pedido Raven) vs ventas (Tango) por local.
export async function GET(req: NextRequest) {
  const g = await guard("/pedidos");
  if ("res" in g) return g.res;
  const def = rangoPorDefecto();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  try {
    const data = await getComparativoPorLocal({ desde, hasta });
    return NextResponse.json({ ok: true, desde, hasta, ...data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo construir el comparativo." },
      { status: 502 }
    );
  }
}
