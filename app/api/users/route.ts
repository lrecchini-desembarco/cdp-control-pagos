import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getUsuarios, addUsuario, removeUsuario } from "@/lib/users-store";
import type { Usuario } from "@/lib/users-store";

export const dynamic = "force-dynamic";

async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === "admin" ? s : null;
}

// Nunca exponer el hash de la clave al cliente. El nav propio sí (no es sensible).
const limpiar = (us: Usuario[]) =>
  us.map((u) => ({ email: u.email, rol: u.rol, tieneClave: Boolean(u.pass), nav: u.nav ?? null }));

export async function GET() {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, usuarios: limpiar(await getUsuarios()) });
}

export async function POST(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const { email, rol, password, nav } = (await req.json()) as { email?: string; rol?: string; password?: string; nav?: string[] };
    const usuarios = await addUsuario(String(email), rol as any, password || undefined, Array.isArray(nav) ? nav : undefined);
    return NextResponse.json({ ok: true, usuarios: limpiar(usuarios) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo agregar." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ ok: false, error: "Falta email." }, { status: 400 });
  try {
    const usuarios = await removeUsuario(email);
    return NextResponse.json({ ok: true, usuarios: limpiar(usuarios) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo quitar." },
      { status: 400 }
    );
  }
}
