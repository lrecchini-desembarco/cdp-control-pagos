import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getRatingsEfectivos } from "@/lib/google-ratings-server";

export const dynamic = "force-dynamic";

// GET /api/google-ratings -> ratings efectivos (live fusionado sobre snapshot, o snapshot).
// Lectura rápida: NO llama a la API paga (eso lo hace /refresh por cron).
export async function GET() {
  if (!(await getSesion())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const r = await getRatingsEfectivos();
  return NextResponse.json({ ok: true, ...r });
}
