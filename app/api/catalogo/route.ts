import { NextResponse } from "next/server";
import { getControlCatalogo } from "@/lib/catalogo-control";
import { dataSourceName } from "@/lib/sources";
import { guard } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// GET /api/catalogo -> { ok, problemas, resumen }
export async function GET() {
  const g = await guard(); // no está en el nav: basta sesión válida
  if ("res" in g) return g.res;
  try {
    const { problemas, resumen } = await getControlCatalogo();
    return NextResponse.json({ ok: true, source: dataSourceName(), problemas, resumen });
  } catch (e) {
    console.error("[catalogo] error:", e);
    return NextResponse.json(
      {
        ok: false,
        source: dataSourceName(),
        error: e instanceof Error ? e.message : "No se pudo auditar el catálogo.",
      },
      { status: 502 }
    );
  }
}
