import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getReglasAuto, setReglasAuto, type ReglaAuto } from "@/lib/auto-roles";

export const dynamic = "force-dynamic";

async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === "admin" ? s : null;
}

export async function GET() {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, reglas: await getReglasAuto() });
}

// POST { reglas: ReglaAuto[] } -> reemplaza las reglas
export async function POST(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const { reglas } = (await req.json()) as { reglas?: ReglaAuto[] };
    if (!Array.isArray(reglas)) throw new Error("Formato inválido.");
    return NextResponse.json({ ok: true, reglas: await setReglasAuto(reglas) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
