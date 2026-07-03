import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getOverrides, setOverride } from "@/lib/locales-config";

export const dynamic = "force-dynamic";

// Solo admin y operaciones pueden clasificar/tildar locales.
async function puede() {
  const s = await getSesion();
  return s && (s.rol === "admin" || s.rol === "operaciones") ? s : null;
}

export async function GET() {
  if (!(await puede())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, overrides: await getOverrides() });
}

// POST { nombre, tipo?, operativo? } -> setea el override de ese local.
export async function POST(req: NextRequest) {
  if (!(await puede())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const { nombre, tipo, operativo } = (await req.json()) as {
      nombre?: string;
      tipo?: "propio" | "franquicia" | null;
      operativo?: boolean | null;
    };
    if (!nombre?.trim()) return NextResponse.json({ ok: false, error: "Falta el nombre." }, { status: 400 });
    const patch: { tipo?: "propio" | "franquicia"; operativo?: boolean } = {};
    if (tipo === "propio" || tipo === "franquicia") patch.tipo = tipo;
    if (tipo === null) patch.tipo = undefined; // volver al automático
    if (typeof operativo === "boolean") patch.operativo = operativo;
    if (operativo === null) patch.operativo = undefined;
    const overrides = await setOverride(nombre.trim(), patch);
    return NextResponse.json({ ok: true, overrides });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error." }, { status: 400 });
  }
}
