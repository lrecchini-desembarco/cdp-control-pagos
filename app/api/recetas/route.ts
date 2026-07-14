import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getRecetas, saveReceta, getReceta } from "@/lib/recetas-store";
import { getInsumos } from "@/lib/insumos-store";
import { costearReceta, indiceInsumos } from "@/lib/recetas";
import { getRecetasTango } from "@/lib/sources/tango";
import { agruparRecetasTango, costearRecetaTango, indiceInsumosPorDesc } from "@/lib/recetas-tango";

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
    // Si el SKU no tiene receta en el maestro editable, buscarla en el recetario de
    // Tango (la cocina la carga ahí; ej. hamburguesas de El Desembarco). Así el modal
    // muestra la receta real aunque no esté en el Excel de costos.
    if (!costeadas.some((c) => c.skuTango === sku)) {
      try {
        const filas = (await getRecetasTango()).filter((f) => f.sku === sku);
        if (filas.length) {
          const rt = agruparRecetasTango(filas)[0];
          if (rt) costeadas.push(costearRecetaTango(rt, indiceInsumosPorDesc(insumos)));
        }
      } catch { /* si Tango no está disponible, el modal muestra "sin receta" */ }
    }
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
