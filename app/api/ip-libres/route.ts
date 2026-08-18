import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getIps, importarIps, editarIp, removeIp } from "@/lib/ip-libres-store";

export const dynamic = "force-dynamic";

async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === "admin" ? s : null;
}

export async function GET() {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, items: await getIps() });
}

// POST { filas: [...] }   -> importación masiva desde el CSV del script.
// POST { id, usada|nota } -> edición puntual (tildar en uso / anotar).
export async function POST(req: NextRequest) {
  const s = await soloAdmin();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    if (Array.isArray(body?.filas)) {
      const r = await importarIps(body.filas, s.email);
      return NextResponse.json({ ok: true, ...r });
    }
    if (body?.id) {
      const items = await editarIp(String(body.id), body, s.email);
      return NextResponse.json({ ok: true, items });
    }
    return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, items: await removeIp(id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo borrar." }, { status: 400 });
  }
}
