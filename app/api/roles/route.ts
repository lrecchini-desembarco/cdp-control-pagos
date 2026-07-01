import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { getRolesNav, setRolNav } from "@/lib/roles-store";
import { NAV_CATALOG, ROLES, ROLES_LIST, esRol, NAV_SIEMPRE } from "@/lib/roles";

export const dynamic = "force-dynamic";

async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === "admin" ? s : null;
}

const meta = () => ({
  catalog: NAV_CATALOG,
  roles: ROLES_LIST.map((r) => ({ id: r, label: ROLES[r].label })),
  fijas: NAV_SIEMPRE, // no se pueden desmarcar
});

// GET /api/roles -> nav por rol + catálogo (para editar los permisos del menú)
export async function GET() {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ ok: true, navByRol: await getRolesNav(), ...meta() });
}

// POST { rol, nav: string[] } -> guarda qué ve ese rol
export async function POST(req: NextRequest) {
  if (!(await soloAdmin())) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  try {
    const { rol, nav } = (await req.json()) as { rol?: string; nav?: string[] };
    if (!esRol(rol) || !Array.isArray(nav)) throw new Error("Rol o nav inválido.");
    const navByRol = await setRolNav(rol, nav.map(String));
    return NextResponse.json({ ok: true, navByRol, ...meta() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." },
      { status: 400 }
    );
  }
}
