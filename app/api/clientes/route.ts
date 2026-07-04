import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getClientes } from "@/lib/clientes";

export const dynamic = "force-dynamic";

// Lista de clientes (CRM). Auth: admin, operaciones o comparación (datos personales).
const PUEDEN_VER = new Set(["admin", "operaciones", "comparacion"]);
export async function GET() {
  const s = await getSesion();
  if (!s || !PUEDEN_VER.has(s.rol)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, clientes: await getClientes() });
}
