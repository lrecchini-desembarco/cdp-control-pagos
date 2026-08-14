import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { puedeVerCredenciales } from "@/lib/credenciales";
import { importarCredenciales } from "@/lib/credenciales-store";

export const dynamic = "force-dynamic";

// Carga masiva desde CSV/Excel. El archivo se parsea en el navegador (así el binario
// con contraseñas no se sube a ningún lado): acá llegan solo las filas confirmadas.
// Misma lista blanca por email que el resto de la bóveda.
export async function POST(req: NextRequest) {
  const s = await getSesion();
  if (!puedeVerCredenciales(s?.email)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await req.json();
    const r = await importarCredenciales(body?.filas, s!.email);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo importar." },
      { status: 400 }
    );
  }
}
