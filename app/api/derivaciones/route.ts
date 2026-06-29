import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getDerivaciones, addDerivacion, resumenDerivaciones } from "@/lib/derivaciones-store";

export const dynamic = "force-dynamic";

// POST público: lo dispara el consumidor al tocar "Calificar en Google".
export async function POST(req: NextRequest) {
  try {
    const { local } = (await req.json()) as { local?: string };
    if (!local) return NextResponse.json({ ok: false, error: "Falta el local." }, { status: 400 });
    return NextResponse.json({ ok: true, derivacion: addDerivacion(local) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar." },
      { status: 500 }
    );
  }
}

// GET con sesión: la consola admin ve el embudo (derivaciones por local).
export async function GET(req: NextRequest) {
  if (!getSesion()) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const local = req.nextUrl.searchParams.get("local") ?? undefined;
  const derivaciones = getDerivaciones(local);
  return NextResponse.json({ ok: true, derivaciones, resumen: resumenDerivaciones(derivaciones) });
}
