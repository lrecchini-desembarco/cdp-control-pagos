import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getLocales, upsertLocal, removeLocal } from "@/lib/locales-store";

export const dynamic = "force-dynamic";

// GET es PÚBLICO: el consumidor (sin login) necesita la lista de locales.
export async function GET() {
  return NextResponse.json({ ok: true, locales: getLocales() });
}

// Mutaciones: solo con sesión (admin/operaciones cargan locales y su link Google).
export async function POST(req: NextRequest) {
  if (!getSesion()) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  try {
    const { nombre, googleUrl } = (await req.json()) as { nombre?: string; googleUrl?: string };
    const locales = upsertLocal(String(nombre ?? ""), googleUrl);
    return NextResponse.json({ ok: true, locales });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!getSesion()) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const nombre = req.nextUrl.searchParams.get("nombre");
  if (!nombre) return NextResponse.json({ ok: false, error: "Falta nombre." }, { status: 400 });
  return NextResponse.json({ ok: true, locales: removeLocal(nombre) });
}
