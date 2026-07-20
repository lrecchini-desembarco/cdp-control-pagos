import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { guard, guardAdmin } from "@/lib/api-guard";
import { listarIngresos, guardarIngreso, eliminarIngreso, getConfig, setConfig } from "@/lib/nuevos-ingresos-store";
import { limpiarIngreso } from "@/lib/nuevos-ingresos";

export const dynamic = "force-dynamic";

// GET -> lista de ingresos + config de la tarjeta + flag de edición.
export async function GET() {
  const g = await guard("/bienvenida");
  if ("res" in g) return g.res;
  const [ingresos, config] = await Promise.all([listarIngresos(), getConfig()]);
  return NextResponse.json({ ok: true, ingresos, config, puedeEditar: g.s.rol === "admin" });
}

// POST { ingreso } -> upsert por id; { config } -> edita el texto de la tarjeta. Solo admin.
export async function POST(req: NextRequest) {
  const g = await guardAdmin();
  if ("res" in g) return g.res;
  try {
    const body = await req.json();
    if (body?.config) {
      return NextResponse.json({ ok: true, config: await setConfig(body.config) });
    }
    const entrada = body?.ingreso ?? {};
    const id = typeof entrada.id === "string" && entrada.id ? entrada.id : randomUUID();
    const limpio = limpiarIngreso(entrada, id);
    if (!limpio) return NextResponse.json({ ok: false, error: "El email y la clave son obligatorios." }, { status: 400 });
    return NextResponse.json({ ok: true, ingresos: await guardarIngreso(limpio) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 500 });
  }
}

// DELETE ?id= -> borra un ingreso. Solo admin.
export async function DELETE(req: NextRequest) {
  const g = await guardAdmin();
  if ("res" in g) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta el id." }, { status: 400 });
  return NextResponse.json({ ok: true, ingresos: await eliminarIngreso(id) });
}
