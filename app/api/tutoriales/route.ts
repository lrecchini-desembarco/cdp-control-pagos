import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getTutoriales, addTutorial, removeTutorial } from "@/lib/tutoriales-store";

export const dynamic = "force-dynamic";

// Ver la lista: cualquiera con sesión. Subir/borrar: solo admin (como el resto de la app).
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const seccion = req.nextUrl.searchParams.get("seccion") ?? undefined;
  return NextResponse.json({ ok: true, items: await getTutoriales(seccion) });
}

// POST (admin): { seccion, titulo, archivo, dataBase64 } -> alta de un tutorial.
export async function POST(req: NextRequest) {
  const s = await getSesion();
  if (s?.rol !== "admin") return NextResponse.json({ ok: false, error: "Solo sistemas puede subir tutoriales." }, { status: 403 });
  try {
    const body = await req.json();
    return NextResponse.json({ ok: true, items: await addTutorial({ ...body, email: s.email }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo subir." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const s = await getSesion();
  if (s?.rol !== "admin") return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, items: await removeTutorial(id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo borrar." }, { status: 400 });
  }
}
