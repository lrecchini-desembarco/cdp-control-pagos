import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getListas, setPrecio } from "@/lib/listas-store";
import { getCanales, updateCanal } from "@/lib/canales-store";
import { margenApps, type MargenApps } from "@/lib/canales";
import { getRecetas } from "@/lib/recetas-store";
import { getInsumos } from "@/lib/insumos-store";
import { costearReceta, indiceInsumos } from "@/lib/recetas";
import { getVentasPorTurno } from "@/lib/ventas";
import { rangoPorDefecto } from "@/lib/cruce";

export const dynamic = "force-dynamic";

const ROLES_OK = new Set(["admin", "operaciones"]);
async function autorizado() {
  const s = await getSesion();
  return s && ROLES_OK.has(s.rol) ? s : null;
}

// GET: sin ?lista -> listas de apps + canales. Con ?lista&canal -> tabla de margen por canal.
export async function GET(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const [listas, canales] = await Promise.all([getListas(), getCanales()]);
  const appsListas = listas.filter((l) => l.tipo === "apps");

  const listaId = req.nextUrl.searchParams.get("lista");
  if (!listaId) {
    return NextResponse.json({
      ok: true, canales,
      listas: appsListas.map(({ precios, ...m }) => ({ ...m, nProductos: Object.keys(precios).length })),
    });
  }
  const lista = appsListas.find((l) => l.id === listaId);
  if (!lista) return NextResponse.json({ ok: false, error: "Lista de apps no encontrada." }, { status: 404 });
  const canal = canales.find((c) => c.id === (req.nextUrl.searchParams.get("canal") ?? canales[0].id)) ?? canales[0];

  const def = rangoPorDefecto();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;

  const [recetas, insumos, ventas, salon] = await Promise.all([
    getRecetas(), getInsumos(), getVentasPorTurno({ desde, hasta }),
    Promise.resolve(listas.find((l) => l.marca === lista.marca && l.tipo === "salon")),
  ]);
  const idx = indiceInsumos(insumos);
  const costoPorSku = new Map(recetas.map((r) => [r.skuTango, costearReceta(r, idx).costoConImp]));
  const descPorSku = new Map(recetas.map((r) => [r.skuTango, r.descripcion]));
  for (const a of ventas.articulos) if (!descPorSku.has(a.sku)) descPorSku.set(a.sku, a.nombre);
  const uPorSku = new Map(ventas.articulos.map((a) => [a.sku, a.total]));

  const filas: MargenApps[] = Object.entries(lista.precios).map(([sku, precio]) =>
    margenApps(sku, descPorSku.get(sku) ?? sku, precio, salon?.precios[sku] ?? 0, costoPorSku.get(sku) ?? 0, lista, canal, uPorSku.get(sku) ?? 0)
  );
  return NextResponse.json({ ok: true, lista, canal, desde, hasta, filas });
}

// POST: { canal:id, ...params } -> edita comisiones; { id, sku, precio } -> setea precio de apps.
export async function POST(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    if (body?.canal) return NextResponse.json({ ok: true, canales: await updateCanal(body.canal, body) });
    if (body?.id && body?.sku !== undefined) return NextResponse.json({ ok: true, listas: await setPrecio(body.id, body.sku, body.precio) });
    throw new Error("Payload inválido.");
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
