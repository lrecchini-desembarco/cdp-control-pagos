import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { setPerfilFranquiciado } from "@/lib/users-store";

export const dynamic = "force-dynamic";

// POST /api/franquiciado — el franquiciado logueado guarda su propio perfil
// (marca / local / puesto) en su primer ingreso. Solo puede setear el SUYO.
export async function POST(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (s.rol !== "franquiciado") return NextResponse.json({ ok: false, error: "Solo para franquiciados." }, { status: 403 });
  try {
    const { marca, local, puesto } = (await req.json()) as { marca?: string; local?: string; puesto?: string };
    await setPerfilFranquiciado(s.email, marca ?? "", local ?? "", puesto ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
