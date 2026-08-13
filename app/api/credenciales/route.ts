import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { puedeVerCredenciales } from "@/lib/credenciales";
import {
  cifradoConfigurado,
  getCredenciales,
  removeCredencial,
  revelar,
  upsertCredencial,
} from "@/lib/credenciales-store";

export const dynamic = "force-dynamic";

// Lista blanca por email, no por rol: un admin que no esté en la lista tampoco entra.
async function autorizado() {
  const s = await getSesion();
  return puedeVerCredenciales(s?.email) ? s : null;
}

const no = () => NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
const error = (e: unknown) =>
  NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo completar." }, { status: 400 });

// GET            -> lista sin contraseñas
// GET ?revelar=id -> la contraseña en claro de UNA credencial
export async function GET(req: NextRequest) {
  const s = await autorizado();
  if (!s) return no();

  const id = req.nextUrl.searchParams.get("revelar");
  if (id) {
    try {
      return NextResponse.json({ ok: true, secreto: await revelar(id) });
    } catch (e) {
      return error(e);
    }
  }
  return NextResponse.json({ ok: true, items: await getCredenciales(), cifrado: cifradoConfigurado() });
}

export async function POST(req: NextRequest) {
  const s = await autorizado();
  if (!s) return no();
  try {
    return NextResponse.json({ ok: true, items: await upsertCredencial(await req.json(), s.email) });
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(req: NextRequest) {
  const s = await autorizado();
  if (!s) return no();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta id." }, { status: 400 });
  return NextResponse.json({ ok: true, items: await removeCredencial(id) });
}
