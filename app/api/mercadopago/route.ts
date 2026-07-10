import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { sesionPuedeVer } from "@/lib/roles-store";
import { getCobrosMP } from "@/lib/mercadopago-store";
import { recentDates } from "@/lib/catalogo";

export const dynamic = "force-dynamic";

// GET /api/mercadopago?dias=N -> cobros de MP agregados por día (del cache). Rápido.
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!(await sesionPuedeVer(s, "/mercadopago"))) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  const dias = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("dias")) || 8, 60));
  const f = recentDates(dias);
  try {
    const data = await getCobrosMP(f[f.length - 1], f[0]);
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo leer MP." }, { status: 502 });
  }
}
