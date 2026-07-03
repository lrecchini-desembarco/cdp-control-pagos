import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getPedidosPorLocal } from "@/lib/pedidos";
import { rangoPorDefecto } from "@/lib/cruce";

export const dynamic = "force-dynamic";

// GET /api/pedidos?desde&hasta -> pedidos reales de Raven por local (propio/franquicia).
export async function GET(req: NextRequest) {
  if (!(await getSesion())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const def = rangoPorDefecto();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  try {
    const data = await getPedidosPorLocal({ desde, hasta });
    return NextResponse.json({ ok: true, desde, hasta, ...data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudieron traer los pedidos de Raven." },
      { status: 502 }
    );
  }
}
