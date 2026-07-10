import { NextRequest, NextResponse } from "next/server";
import { getPrecios } from "@/lib/precios";
import { preciosSourceName } from "@/lib/sources";
import { guard } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// GET /api/precios[?sucursal=] -> precios generales (+ de una sucursal si se pide)
export async function GET(req: NextRequest) {
  const g = await guard("/precios");
  if ("res" in g) return g.res;
  const sucursal = req.nextUrl.searchParams.get("sucursal") ?? undefined;
  try {
    const data = await getPrecios(sucursal);
    return NextResponse.json({ ok: true, source: preciosSourceName(), ...data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, source: preciosSourceName(), error: e instanceof Error ? e.message : "No se pudieron leer los precios." },
      { status: 502 }
    );
  }
}
