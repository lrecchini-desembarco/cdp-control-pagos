import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getClientes } from "@/lib/clientes";

export const dynamic = "force-dynamic";

// Lista de clientes (CRM). Auth: admin u operaciones (datos personales).
export async function GET() {
  const s = await getSesion();
  if (!s || (s.rol !== "admin" && s.rol !== "operaciones")) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, clientes: await getClientes() });
}
