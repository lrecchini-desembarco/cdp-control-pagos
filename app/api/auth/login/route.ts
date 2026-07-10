import { NextRequest, NextResponse } from "next/server";
import { findUsuario } from "@/lib/users-store";
import { verifyPassword } from "@/lib/auth-hash";
import { COOKIE, firmarSesion } from "@/lib/auth-cookie";
import { homeDe } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Clave genérica compartida (fallback para usuarios sin clave propia).
const GENERICA = process.env.APP_PASSWORD ?? "cdp2026";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    const u = email ? await findUsuario(email) : undefined;
    // Si el usuario tiene clave propia se valida contra ella; si no, la genérica.
    const valida = u ? (u.pass ? verifyPassword(password ?? "", u.pass) : password === GENERICA) : false;
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
