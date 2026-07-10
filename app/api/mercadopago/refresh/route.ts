import { NextRequest, NextResponse } from "next/server";
import { refrescarMP } from "@/lib/mercadopago-store";
import { cronOAdmin } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// GET /api/mercadopago/refresh -> trae los últimos días de MP y los cachea.
// Lo dispara el CRON (ver vercel.json). No-op sin MERCADOPAGO_ACCESS_TOKEN.
async function handler(req: NextRequest) {
  if (!(await cronOAdmin(req))) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const dias = Number(req.nextUrl.searchParams.get("dias")) || 8;
  try {
    const r = await refrescarMP(dias);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo refrescar MP." }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
