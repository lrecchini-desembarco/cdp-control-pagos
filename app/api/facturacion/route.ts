import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { sesionPuedeVer } from "@/lib/roles-store";
import { getFacturacion, } from "@/lib/facturacion";
import { rangoActividad } from "@/lib/actividad";
import { dataSourceName, ventasSourceName, preciosSourceName } from "@/lib/sources";

export const dynamic = "force-dynamic";

// GET /api/facturacion?desde&hasta -> facturación estimada (precio efectivo × unidades)
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!(await sesionPuedeVer(s, "/facturacion"))) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  const def = rangoActividad();
  const desde = req.nextUrl.searchParams.get("desde") ?? def.desde;
  const hasta = req.nextUrl.searchParams.get("hasta") ?? def.hasta;
  try {
    const data = await getFacturacion({ desde, hasta });
    return NextResponse.json({ ok: true, source: dataSourceName(), ventasSource: ventasSourceName(), preciosSource: preciosSourceName(), ...data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, source: dataSourceName(), error: e instanceof Error ? e.message : "No se pudo calcular la facturación." },
      { status: 502 }
    );
  }
}
