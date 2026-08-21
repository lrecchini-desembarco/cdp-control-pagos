import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { puedeVerCredenciales } from "@/lib/credenciales";
import { getAccesosPublicos, buscarAcceso, revelarAcceso } from "@/lib/accesos-server";
import { getAuditoria, registrar } from "@/lib/auditoria-store";

export const dynamic = "force-dynamic";

// Accesos del ecosistema web. Mismo candado que la bóveda de Credenciales: lista
// blanca por EMAIL resuelta en el SERVIDOR (un admin que no esté en la lista
// tampoco entra). El filtrado no es cosmético: los valores ni siquiera se
// serializan si el usuario no corresponde.
async function autorizado() {
  const s = await getSesion();
  return puedeVerCredenciales(s?.email) ? s : null;
}

const no = () => NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

// GET             -> estructura completa, SIN valores (cada secreto dice si está cargado)
// GET ?revelar=id -> el valor de UN acceso, y queda registrado en la bitácora
export async function GET(req: NextRequest) {
  const s = await autorizado();
  if (!s) return no();

  // Bitácora: quién reveló o copió qué y cuándo. Nunca incluye valores.
  if (req.nextUrl.searchParams.get("bitacora")) {
    return NextResponse.json({ ok: true, eventos: await getAuditoria(100) });
  }

  const id = req.nextUrl.searchParams.get("revelar");
  if (id) {
    const acceso = buscarAcceso(id);
    if (!acceso) return NextResponse.json({ ok: false, error: "No existe ese acceso." }, { status: 404 });
    const valor = revelarAcceso(id);
    if (valor === null) {
      return NextResponse.json(
        { ok: false, error: `"${acceso.nombre}" no está cargado. Cargá la variable en Vercel (marcada como Sensitive) para poder verlo.` },
        { status: 404 }
      );
    }
    await registrar({ email: s.email, accion: "revelar", recurso: id, detalle: acceso.nombre });
    return NextResponse.json({ ok: true, valor });
  }

  return NextResponse.json({ ok: true, grupos: getAccesosPublicos() });
}

// POST { id } -> registra que se copió un acceso (el valor va por el GET de arriba).
export async function POST(req: NextRequest) {
  const s = await autorizado();
  if (!s) return no();
  try {
    const { id } = (await req.json()) as { id?: string };
    const acceso = id ? buscarAcceso(id) : undefined;
    if (!acceso) return NextResponse.json({ ok: false, error: "No existe ese acceso." }, { status: 404 });
    await registrar({ email: s.email, accion: "copiar", recurso: acceso.id, detalle: acceso.nombre });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
}
