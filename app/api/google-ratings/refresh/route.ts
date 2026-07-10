import { NextRequest, NextResponse } from "next/server";
import { refrescarRatings } from "@/lib/google-ratings-server";

export const dynamic = "force-dynamic";

// GET /api/google-ratings/refresh -> refresca los ratings desde la Places API (paga).
// Lo dispara el CRON semanal (ver vercel.json). Salta si el cache es reciente, salvo
// ?force=1. Sin sesión (igual que el cron de /api/notify): no expone datos sensibles,
// solo cachea números públicos de Google, y tiene guarda anti-costo por antigüedad.
async function handler(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const r = await refrescarRatings(force);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo refrescar." }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
