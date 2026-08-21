import { NextRequest, NextResponse } from "next/server";
import { findUsuario } from "@/lib/users-store";
import { verifyPassword } from "@/lib/auth-hash";
import { COOKIE, firmarSesion } from "@/lib/auth-cookie";
import { homeDe } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Clave genérica compartida (fallback para usuarios sin clave propia).
// Sale SOLO de la env: el repo es público, así que acá no puede haber ninguna clave
// escrita. Si APP_PASSWORD no está configurada, la genérica queda deshabilitada
// (falla cerrado) y solo entran los usuarios con clave propia o por Google.
const GENERICA = process.env.APP_PASSWORD?.trim() ?? "";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    const u = email ? await findUsuario(email) : undefined;
    // Si el usuario tiene clave propia se valida contra ella; si no, la genérica.
    const valida = u
      ? u.pass
        ? verifyPassword(password ?? "", u.pass)
        : Boolean(GENERICA) && password === GENERICA
      : false;
    if (!u || !valida) {
      return NextResponse.json({ ok: false, error: "Email no autorizado o clave incorrecta." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, rol: u.rol, redirect: homeDe(u.rol) });
    res.cookies.set(COOKIE, await firmarSesion(u.email), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
}
