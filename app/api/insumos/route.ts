import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getInsumos, upsertInsumo, removeInsumo } from "@/lib/insumos-store";

export const dynamic = "force-dynamic";

const ROLES_OK = new Set(["admin", "operaciones"]);
async function autorizado() {
  const s = await getSesion();
  return s && ROLES_OK.has(s.rol) ? s : null;
}

export async function GET() {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, insumos: await getInsumos() });
}

// POST (admin/operaciones): alta o edición de un insumo.
export async function POST(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    return NextResponse.json({ ok: true, insumos: await upsertInsumo(body) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const cod = req.nextUrl.searchParams.get("cod");
  if (!cod) return NextResponse.json({ ok: false, error: "Falta el código." }, { status: 400 });
  return NextResponse.json({ ok: true, insumos: await removeInsumo(cod) });
}
