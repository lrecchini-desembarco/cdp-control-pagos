import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { workspaceConfigurado, subirFotoMasiva } from "@/lib/google-workspace";

export const dynamic = "force-dynamic";

// POST multipart/form-data: foto (archivo) + emails (JSON string[]).
// Aplica la misma foto corporativa a todos los emails seleccionados.
export async function POST(req: NextRequest) {
  const s = await getSesion();
  if (s?.rol !== "admin") return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  if (!workspaceConfigurado()) return NextResponse.json({ ok: false, error: "Google Workspace no está configurado todavía." }, { status: 501 });

  const form = await req.formData();
  const archivo = form.get("foto");
  const emailsRaw = form.get("emails");
  if (!(archivo instanceof File) || typeof emailsRaw !== "string") {
    return NextResponse.json({ ok: false, error: "Falta la foto o la lista de usuarios." }, { status: 400 });
  }
  let emails: string[];
  try {
    emails = JSON.parse(emailsRaw);
  } catch {
    return NextResponse.json({ ok: false, error: "Lista de usuarios inválida." }, { status: 400 });
  }
  if (!Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ ok: false, error: "Seleccioná al menos un usuario." }, { status: 400 });
  }

  const bytes = Buffer.from(await archivo.arrayBuffer());
  try {
    const resultados = await subirFotoMasiva(emails, bytes);
    return NextResponse.json({ ok: true, resultados });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Error consultando Google." }, { status: 502 });
  }
}
