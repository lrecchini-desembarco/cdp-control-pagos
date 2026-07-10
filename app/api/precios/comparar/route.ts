import { NextResponse } from "next/server";
import { getPrecios } from "@/lib/precios";
import { scrapearMenus, comparar } from "@/lib/menu-web";
import { preciosSourceName } from "@/lib/sources";
import { guard } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // scrapear 2 sitios externos puede tardar

// GET /api/precios/comparar -> menú web (lista) vs Tango (efectivo)
export async function GET() {
  const g = await guard("/precios");
  if ("res" in g) return g.res;
  try {
    const [{ general }, web] = await Promise.all([getPrecios(), scrapearMenus()]);
    const filas = comparar(web, general);
    const con = filas.filter((f) => f.precioTango != null);
    const resumen = {
      web: filas.length,
      matcheados: con.length,
      ok: con.filter((f) => f.estado === "ok").length,
      dif: con.filter((f) => f.estado === "dif").length,
      alerta: con.filter((f) => f.estado === "alerta").length,
      sinMatch: filas.length - con.length,
    };
    return NextResponse.json({ ok: true, source: preciosSourceName(), resumen, filas });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo comparar." },
      { status: 502 }
    );
  }
}
