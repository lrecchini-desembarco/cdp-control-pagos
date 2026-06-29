import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { findLocal } from "@/lib/locales-store";
import { getReviews, addReview, resumenReviews } from "@/lib/reviews-store";

export const dynamic = "force-dynamic";

// POST es PÚBLICO: lo manda el consumidor desde /review (sin login).
// Devuelve el link de Google del local para invitarlo a dejar la reseña pública.
export async function POST(req: NextRequest) {
  try {
    const { local, estrellas, comentario } = (await req.json()) as {
      local?: string;
      estrellas?: number;
      comentario?: string;
    };
    if (!local) return NextResponse.json({ ok: false, error: "Falta el local." }, { status: 400 });
    const review = addReview({ local, estrellas: Number(estrellas), comentario: comentario ?? "" });
    return NextResponse.json({ ok: true, review, googleUrl: findLocal(local)?.googleUrl ?? null });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar." },
      { status: 500 }
    );
  }
}

// GET requiere sesión: la consola admin ve lo que entró.
export async function GET(req: NextRequest) {
  if (!getSesion()) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const local = req.nextUrl.searchParams.get("local") ?? undefined;
  const reviews = getReviews(local);
  return NextResponse.json({ ok: true, reviews, resumen: resumenReviews(reviews) });
}
