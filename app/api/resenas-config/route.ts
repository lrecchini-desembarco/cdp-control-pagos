import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getResenasConfig, setCuponActivo } from "@/lib/resenas-config";

export const dynamic = "force-dynamic";

// GET es PÚBLICO: la pantalla de reseñas del cliente (sin login) lee si el cupón está activo.
export async function GET() {
  return NextResponse.json({ ok: true, ...(await getResenasConfig()) });
}

// POST { cuponActivo } -> prende/apaga el sistema de cupones (admin u operaciones).
export async function POST(req: NextRequest) {
  const s = await getSesion();
  if (!s || (s.rol !== "admin" && s.rol !== "operaciones")) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  try {
    const { cuponActivo } = (await req.json()) as { cuponActivo?: boolean };
    const cfg = await setCuponActivo(Boolean(cuponActivo));
    return NextResponse.json({ ok: true, ...cfg });
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
}
