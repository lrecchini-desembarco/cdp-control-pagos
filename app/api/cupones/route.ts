import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { buscarCupon, usarCupon, listarCupones } from "@/lib/cupones-store";

export const dynamic = "force-dynamic";

// Validación/canje de cupones desde el dashboard. Cualquier usuario logueado (incluye
// rol "local" = la caja). GET ?q= busca por código o teléfono; GET sin q lista recientes.
export async function GET(req: NextRequest) {
  if (!(await getSesion())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q");
  if (q) {
    const cupon = await buscarCupon(q);
    return NextResponse.json({ ok: true, cupon: cupon ?? null });
  }
  return NextResponse.json({ ok: true, cupones: (await listarCupones()).slice(0, 100) });
}

// POST { codigo } -> canjea un uso.
export async function POST(req: NextRequest) {
  if (!(await getSesion())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  try {
    const { codigo } = (await req.json()) as { codigo?: string };
    const r = await usarCupon(String(codigo ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
}
