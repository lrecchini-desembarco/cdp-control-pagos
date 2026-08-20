import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";
import { getCategorias, setCategorias } from "@/lib/tickets-store";

export const dynamic = "force-dynamic";

// GET: cualquier cuenta logueada (hace falta para el formulario de /tickets).
// POST: solo quien tiene acceso al Panel de Sistemas — agrega/quita categorías.
export async function GET() {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, categorias: await getCategorias() });
}

export async function POST(req: NextRequest) {
  const s = await getSesion();
  if (!s || !(await puedeVerPanelSistemas(s.email))) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await req.json();
    if (!Array.isArray(body?.categorias)) return NextResponse.json({ ok: false, error: "Falta la lista de categorías." }, { status: 400 });
    const categorias = await setCategorias(body.categorias);
    return NextResponse.json({ ok: true, categorias });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
