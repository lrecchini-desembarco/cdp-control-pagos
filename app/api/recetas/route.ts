import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getRecetas, saveReceta, getReceta } from "@/lib/recetas-store";
import { getInsumos } from "@/lib/insumos-store";
import { costearReceta, indiceInsumos } from "@/lib/recetas";

export const dynamic = "force-dynamic";

const ROLES_OK = new Set(["admin", "operaciones"]);
async function autorizado() {
  const s = await getSesion();
  return s && ROLES_OK.has(s.rol) ? s : null;
}

// GET: recetas costeadas contra el maestro de insumos vigente.
// ?sku=... -> devuelve además el historial de versiones de esa receta.
export async function GET(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const [recetas, insumos] = await Promise.all([getRecetas(), getInsumos()]);
  const idx = indiceInsumos(insumos);
  const costeadas = recetas.map((r) => costearReceta(r, idx));

  const sku = req.nextUrl.searchParams.get("sku");
  if (sku) {
    const r = await getReceta(sku);
    return NextResponse.json({ ok: true, recetas: costeadas, historial: r?.versiones ?? [] });
  }
  return NextResponse.json({ ok: true, recetas: costeadas });
}

// POST (admin/operaciones): guarda una receta (crea versión nueva).
export async function POST(req: NextRequest) {
  const s = await autorizado();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    const recetas = await saveReceta({ ...body, autor: s.email });
    const idx = indiceInsumos(await getInsumos());
    return NextResponse.json({ ok: true, recetas: recetas.map((r) => costearReceta(r, idx)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
