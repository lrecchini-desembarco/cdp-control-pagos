import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { FEATURES, getPrefs, setPref } from "@/lib/features";

export const dynamic = "force-dynamic";

// GET -> catálogo de funcionalidades + las activadas por este usuario.
export async function GET() {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  return NextResponse.json({ ok: true, features: FEATURES, prefs: await getPrefs(s.email) });
}

// POST { feature, on } -> activa/desactiva una funcionalidad para este usuario.
export async function POST(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  try {
    const { feature, on } = (await req.json()) as { feature?: string; on?: boolean };
    if (!feature || !FEATURES.some((f) => f.key === feature)) {
      return NextResponse.json({ ok: false, error: "Funcionalidad inválida." }, { status: 400 });
    }
    const prefs = await setPref(s.email, feature, Boolean(on));
    return NextResponse.json({ ok: true, prefs });
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
}
