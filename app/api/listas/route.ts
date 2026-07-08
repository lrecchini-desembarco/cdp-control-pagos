import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getListas, setPrecio, updateLista } from "@/lib/listas-store";
import { margenDe, type MargenProducto } from "@/lib/listas";
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

// GET: sin ?id -> lista de listas. Con ?id -> la tabla de margen de esa lista,
// combinando precio (lista) + costo (receta, en vivo) + unidades (Tango).
export async function GET(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const listas = await getListas();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: true, listas: listas.map(({ precios, ...meta }) => ({ ...meta, nProductos: Object.keys(precios).length })) });
  }
  const lista = listas.find((l) => l.id === id);
  if (!lista) return NextResponse.json({ ok: false, error: "Lista no encontrada." }, { status: 404 });

  const def = rangoPorDefecto();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;

  const [recetas, insumos, ventas] = await Promise.all([getRecetas(), getInsumos(), getVentasPorTurno({ desde, hasta })]);
  const idx = indiceInsumos(insumos);
  const costoPorSku = new Map(recetas.map((r) => [r.skuTango, costearReceta(r, idx)]));
  const descPorSku = new Map(recetas.map((r) => [r.skuTango, r.descripcion]));
  const uPorSku = new Map(ventas.articulos.map((a) => [a.sku, a.total]));
  for (const a of ventas.articulos) if (!descPorSku.has(a.sku)) descPorSku.set(a.sku, a.nombre);

  const filas: MargenProducto[] = Object.entries(lista.precios).map(([sku, precio]) =>
    margenDe(sku, descPorSku.get(sku) ?? sku, precio, costoPorSku.get(sku)?.costoConImp ?? 0, lista, uPorSku.get(sku) ?? 0)
  );
  return NextResponse.json({ ok: true, lista, desde, hasta, filas });
}

// POST: { id, sku, precio } -> setea precio; { id, ...params } -> edita la lista.
export async function POST(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();
    if (!body?.id) throw new Error("Falta el id de lista.");
    if (body.sku !== undefined) {
      return NextResponse.json({ ok: true, listas: await setPrecio(body.id, body.sku, body.precio) });
    }
    return NextResponse.json({ ok: true, listas: await updateLista(body.id, body) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
