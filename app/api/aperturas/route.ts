import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getAperturas, upsertApertura, removeApertura } from "@/lib/aperturas-store";

export const dynamic = "force-dynamic";

// GET es PÚBLICO: la cartelera de la TV (sin login) lee el cuadro.
export async function GET() {
  return NextResponse.json({ ok: true, items: await getAperturas() });
}

async function puedeEditar() {
  const s = await getSesion();
  return s && (s.rol === "admin" || s.rol === "operaciones" || s.rol === "gerencia") ? s : null;
}

export async function POST(req: NextRequest) {
  if (!(await puedeEditar())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const items = await upsertApertura(await req.json());
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await puedeEditar())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  return NextResponse.json({ ok: true, items: await removeApertura(id) });
}
