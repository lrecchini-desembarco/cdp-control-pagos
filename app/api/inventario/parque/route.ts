import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getParque, addEquipo, setEquipo, removeEquipo } from "@/lib/parque-store";

export const dynamic = "force-dynamic";

// Parque de computadoras. Mismo criterio que /api/inventario: lo maneja el admin.
async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === "admin" ? s : null;
}

export async function GET() {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, equipos: await getParque() });
}

// POST (admin): con id -> edita; sin id -> alta manual de un equipo.
export async function POST(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    const equipos = body?.id ? await setEquipo(String(body.id), body) : await addEquipo(body);
    return NextResponse.json({ ok: true, equipos });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

// DELETE (admin): solo los equipos cargados a mano.
export async function DELETE(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, equipos: await removeEquipo(id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo borrar." }, { status: 400 });
  }
}
