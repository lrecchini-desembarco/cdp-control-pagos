import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getHtml } from "@/lib/tutoriales-store";

export const dynamic = "force-dynamic";

// Word (.docx con mammoth, .doc con el HTML que dejó el seed) -> HTML para ver online.
export async function GET(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });

  const r = await getHtml(id);
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: 415 });
  return NextResponse.json({ ok: true, html: r.html });
}
