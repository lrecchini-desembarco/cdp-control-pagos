import { NextResponse } from "next/server";
import { getAlertas } from "@/lib/alertas";
import { dataSourceName, pedidosSourceName } from "@/lib/sources";

export const dynamic = "force-dynamic";

// GET /api/alertas -> { ok, alertas, resumen }
export async function GET() {
  try {
    const { alertas, silenciadas, resumen } = await getAlertas();
    return NextResponse.json({ ok: true, source: dataSourceName(), pedidosSource: pedidosSourceName(), alertas, silenciadas, resumen });
  } catch (e) {
    console.error("[alertas] error:", e);
    return NextResponse.json(
      {
        ok: false,
        source: dataSourceName(),
        error:
          e instanceof Error ? e.message : "No se pudieron calcular las alertas.",
      },
      { status: 502 }
    );
  }
}
