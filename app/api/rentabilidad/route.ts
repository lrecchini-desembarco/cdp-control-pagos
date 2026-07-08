import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getListas } from "@/lib/listas-store";
import { margenDe } from "@/lib/listas";
import type { FilaRentabilidad } from "@/lib/rentabilidad";
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

// GET ?lista&desde&hasta -> ranking de productos por margen total (margen × unidades).
export async function GET(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const listas = await getListas();
  if (!req.nextUrl.searchParams.get("lista")) {
    return NextResponse.json({ ok: true, listas: listas.map(({ precios, ...m }) => ({ ...m, nProductos: Object.keys(precios).length })) });
  }
  const lista = listas.find((l) => l.id === req.nextUrl.searchParams.get("lista"));
  if (!lista) return NextResponse.json({ ok: false, error: "Lista no encontrada." }, { status: 404 });

  const def = rangoPorDefecto();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;

  const [recetas, insumos, ventas] = await Promise.all([getRecetas(), getInsumos(), getVentasPorTurno({ desde, hasta })]);
  const idx = indiceInsumos(insumos);
  const costoPorSku = new Map(recetas.map((r) => [r.skuTango, costearReceta(r, idx).costoConImp]));
  const descPorSku = new Map(recetas.map((r) => [r.skuTango, r.descripcion]));
  for (const a of ventas.articulos) if (!descPorSku.has(a.sku)) descPorSku.set(a.sku, a.nombre);
  const uPorSku = new Map(ventas.articulos.map((a) => [a.sku, a.total]));

  const filas: FilaRentabilidad[] = Object.entries(lista.precios).map(([sku, precio]) => {
    const costo = costoPorSku.get(sku) ?? 0;
    const unidades = uPorSku.get(sku) ?? 0;
    const m = margenDe(sku, descPorSku.get(sku) ?? sku, precio, costo, lista, unidades);
    return {
      skuTango: sku, descripcion: descPorSku.get(sku) ?? sku, precioVenta: precio, costo,
      recetaFalta: costo <= 0, unidades,
      margenUnitario: m.margen, margenTotal: m.margen * unidades, facturacion: precio * unidades, pctMargen: 0,
    };
  });
  const margenTotal = filas.reduce((s, f) => s + f.margenTotal, 0) || 1;
  for (const f of filas) f.pctMargen = f.margenTotal / margenTotal;
  filas.sort((a, b) => b.margenTotal - a.margenTotal);

  return NextResponse.json({
    ok: true, lista, desde, hasta, filas,
    total: {
      margen: filas.reduce((s, f) => s + f.margenTotal, 0),
      facturacion: filas.reduce((s, f) => s + f.facturacion, 0),
      unidades: filas.reduce((s, f) => s + f.unidades, 0),
      pierden: filas.filter((f) => f.margenTotal < 0 && !f.recetaFalta).length,
    },
  });
}
