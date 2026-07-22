import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getAperturas, upsertApertura, removeApertura, getColumnas, setColumnas } from "@/lib/aperturas-store";

export const dynamic = "force-dynamic";

// GET es PÚBLICO: la cartelera de la TV (sin login) lee el cuadro.
export async function GET() {
  const [items, columnas] = await Promise.all([getAperturas(), getColumnas()]);
  return NextResponse.json({ ok: true, items, columnas });
}

async function puedeEditar() {
  const s = await getSesion();
  return s && (s.rol === "admin" || s.rol === "operaciones" || s.rol === "gerencia") ? s : null;
}

export async function POST(req: NextRequest) {
  if (!(await puedeEditar())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    // Acción de columnas custom (crear/renombrar/reordenar/eliminar).
    if (body?.accion === "columnas") {
      const columnas = await setColumnas(Array.isArray(body.columnas) ? body.columnas : []);
      return NextResponse.json({ ok: true, items: await getAperturas(), columnas });
    }
    const items = await upsertApertura(body);
    return NextResponse.json({ ok: true, items, columnas: await getColumnas() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await puedeEditar())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  const items = await removeApertura(id);
  return NextResponse.json({ ok: true, items, columnas: await getColumnas() });
}
