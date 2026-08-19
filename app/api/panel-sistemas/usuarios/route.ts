import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getAccesoPanel, agregarAccesoPanel, quitarAccesoPanel, puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";

export const dynamic = "force-dynamic";

// Quién puede gestionar la lista: solo quien YA tiene acceso al panel (mismo
// candado que la pantalla que lo muestra) — no es un permiso separado.
async function conAcceso() {
  const s = await getSesion();
  return (await puedeVerPanelSistemas(s?.email)) ? s : null;
}

export async function GET() {
  if (!(await conAcceso())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await getAccesoPanel()) });
}

export async function POST(req: NextRequest) {
  if (!(await conAcceso())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const { email } = await req.json();
    const extra = await agregarAccesoPanel(String(email ?? ""));
    return NextResponse.json({ ok: true, extra });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo agregar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await conAcceso())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ ok: false, error: "Falta email." }, { status: 400 });
  try {
    const extra = await quitarAccesoPanel(email);
    return NextResponse.json({ ok: true, extra });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo quitar." }, { status: 400 });
  }
}
