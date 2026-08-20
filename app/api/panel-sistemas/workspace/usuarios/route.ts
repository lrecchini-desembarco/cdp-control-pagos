import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { workspaceConfigurado, listarUsuariosWorkspace, detalleUsuarioWorkspace } from "@/lib/google-workspace";

export const dynamic = "force-dynamic";

// Igual candado que /panel-sistemas/usuarios: gestión de Workspace = admin, siempre.
async function esAdmin() {
  const s = await getSesion();
  return s?.rol === "admin";
}

// GET -> lista de usuarios (?email=x@... -> detalle puntual: permisos, grupos, shared drives).
export async function GET(req: NextRequest) {
  if (!(await esAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  if (!workspaceConfigurado()) return NextResponse.json({ ok: false, error: "Google Workspace no está configurado todavía." }, { status: 501 });

  const email = req.nextUrl.searchParams.get("email");
  try {
    if (email) {
      const detalle = await detalleUsuarioWorkspace(email);
      return NextResponse.json({ ok: true, detalle });
    }
    const usuarios = await listarUsuariosWorkspace();
    return NextResponse.json({ ok: true, usuarios });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Error consultando Google." }, { status: 502 });
  }
}
