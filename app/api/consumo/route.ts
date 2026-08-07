import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/api-guard";
import {
  getResumenMensual, getComparativo, getConsumoPorInsumo, getPorLocal, getSucursales, getMesesDisponibles,
  type FiltrosConsumo,
} from "@/lib/consumo";

export const dynamic = "force-dynamic";

// GET /api/consumo?q=resumen|comparativo|insumo|sucursales|meses
//   resumen:      -> [{mes, ventas, unidades, cmv, margen, margenPct}]
//   comparativo:  &mesA=YYYY-MM&mesB=YYYY-MM -> por insumo, A vs B
//   insumo:       &desde=YYYY-MM&hasta=YYYY-MM -> consumo por insumo del rango
//   sucursales:   -> catálogo para el filtro
//   meses:        -> meses disponibles (para poblar selectores)
// Filtros comunes (todas menos sucursales/meses): &marca=D|T &propias=1|0 &sucursal=<id>
export async function GET(req: NextRequest) {
  const g = await guard("/compras");
  if ("res" in g) return g.res;

  const sp = req.nextUrl.searchParams;
  const modo = sp.get("q") ?? "resumen";

  const f: FiltrosConsumo = {};
  const marca = sp.get("marca");
  if (marca === "D" || marca === "T") f.marca = marca;
  const propias = sp.get("propias");
  if (propias === "1") f.propias = true;
  else if (propias === "0") f.propias = false;
  const suc = sp.get("sucursal");
  if (suc && /^\d+$/.test(suc)) f.sucursalId = Number(suc);

  try {
    if (modo === "sucursales") {
      return NextResponse.json({ ok: true, sucursales: await getSucursales() });
    }
    if (modo === "meses") {
      return NextResponse.json({ ok: true, meses: await getMesesDisponibles() });
    }
    if (modo === "comparativo") {
      const mesA = sp.get("mesA") ?? "";
      const mesB = sp.get("mesB") ?? "";
      if (!/^\d{4}-\d{2}$/.test(mesA) || !/^\d{4}-\d{2}$/.test(mesB)) {
        return NextResponse.json({ ok: false, error: "Faltan mesA/mesB (YYYY-MM)." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, insumos: await getComparativo(mesA, mesB, f) });
    }
    if (modo === "insumo") {
      const desde = sp.get("desde") ?? "";
      const hasta = sp.get("hasta") ?? "";
      if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) {
        return NextResponse.json({ ok: false, error: "Faltan desde/hasta (YYYY-MM)." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, insumos: await getConsumoPorInsumo(desde, hasta, f) });
    }
    if (modo === "local") {
      const desde = sp.get("desde") ?? "";
      const hasta = sp.get("hasta") ?? "";
      if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) {
        return NextResponse.json({ ok: false, error: "Faltan desde/hasta (YYYY-MM)." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, locales: await getPorLocal(desde, hasta, f) });
    }
    // default: resumen mensual
    return NextResponse.json({ ok: true, meses: await getResumenMensual(f) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo leer la base de consumo." },
      { status: 502 }
    );
  }
}
