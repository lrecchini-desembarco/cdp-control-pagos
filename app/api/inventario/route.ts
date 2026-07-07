import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getInventario, upsertItem, removeItem, setAprobacion } from "@/lib/inventario-store";

export const dynamic = "force-dynamic";

async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === "admin" ? s : null;
}

export async function GET() {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, items: await getInventario() });
}

// POST (admin): alta/edición. Si viene solo {id, aprobacion}, registra la aprobación.
export async function POST(req: NextRequest) {
  const s = await soloAdmin();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    if (body?.id && body?.aprobacion && Object.keys(body).length <= 2) {
      return NextResponse.json({ ok: true, items: await setAprobacion(String(body.id), body.aprobacion, s.email) });
    }
    return NextResponse.json({ ok: true, items: await upsertItem(body) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  return NextResponse.json({ ok: true, items: await removeItem(id) });
}
