import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getRecetas, saveReceta, getReceta, getGrupos, setGrupos, guardarProducto, reordenarProductos, renombrarGrupo, eliminarGrupo } from "@/lib/recetas-store";
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
  const [recetas, insumos, grupos] = await Promise.all([getRecetas(), getInsumos(), getGrupos()]);
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
    return NextResponse.json({ ok: true, recetas: costeadas, grupos, historial: r?.versiones ?? [] });
  }
  return NextResponse.json({ ok: true, recetas: costeadas, grupos });
}

// POST (admin/operaciones): despacha por `accion`.
//  - "receta" (default): guarda una receta -> crea versión nueva.
//  - "producto": crea/edita un producto del maestro (grupo/orden/canales, sin versión).
//  - "reordenar": fija el orden de varios productos.
//  - "grupos": reemplaza la lista/orden de grupos (crear/renombrar/reordenar).
export async function POST(req: NextRequest) {
  const s = await autorizado();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    const accion = body?.accion ?? "receta";
    let recetas;
    if (accion === "grupos") {
      const grupos = await setGrupos(Array.isArray(body.grupos) ? body.grupos : []);
      recetas = await getRecetas();
      const idx = indiceInsumos(await getInsumos());
      return NextResponse.json({ ok: true, recetas: recetas.map((r) => costearReceta(r, idx)), grupos });
    }
    if (accion === "producto") recetas = await guardarProducto(body);
    else if (accion === "reordenar") recetas = await reordenarProductos(Array.isArray(body.items) ? body.items : []);
    else if (accion === "renombrar-grupo") recetas = await renombrarGrupo(body.de, body.a);
    else if (accion === "eliminar-grupo") recetas = await eliminarGrupo(body.nombre);
    else recetas = await saveReceta({ ...body, autor: s.email });
    const [idx, grupos] = await Promise.all([indiceInsumos(await getInsumos()), getGrupos()]);
    return NextResponse.json({ ok: true, recetas: recetas.map((r) => costearReceta(r, idx)), grupos });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
