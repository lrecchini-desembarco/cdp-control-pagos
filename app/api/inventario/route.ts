import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getInventario, upsertItem, removeItem, setAprobacion, type Aprobacion } from "@/lib/inventario-store";

export const dynamic = "force-dynamic";

async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === "admin" ? s : null;
}
// El inventario lo ven (y el Dueño aprueba) admin y dueño.
async function puedeVer() {
  const s = await getSesion();
  return s && (s.rol === "admin" || s.rol === "dueno") ? s : null;
}

export async function GET() {
  if (!(await puedeVer())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, items: await getInventario() });
}

// POST: admin -> alta/edición completa. Dueño -> SOLO aprobar/rechazar una compra.
export async function POST(req: NextRequest) {
  const s = await puedeVer();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const body = await req.json();

    // El Dueño (no admin) solo puede tocar la aprobación de un ítem existente.
    if (s.rol !== "admin") {
      const ap = body?.aprobacion as Aprobacion | undefined;
      if (!body?.id || !ap || !["pendiente", "aprobado", "rechazado"].includes(ap)) {
        return NextResponse.json({ ok: false, error: "El Dueño solo puede aprobar o rechazar." }, { status: 403 });
      }
      return NextResponse.json({ ok: true, items: await setAprobacion(String(body.id), ap, s.email) });
    }

    // Admin: si viene aprobación, la registramos con su email; el resto es upsert normal.
    if (body?.id && body?.aprobacion && Object.keys(body).length <= 2) {
      return NextResponse.json({ ok: true, items: await setAprobacion(String(body.id), body.aprobacion, s.email) });
    }
    return NextResponse.json({ ok: true, items: await upsertItem(body) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  return NextResponse.json({ ok: true, items: await removeItem(id) });
}
