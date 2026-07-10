import { NextRequest, NextResponse } from "next/server";
import { intercambiarCodigo, dominioPermitido } from "@/lib/google-auth";
import { ensureUsuario } from "@/lib/users-store";
import { COOKIE, firmarSesion } from "@/lib/auth-cookie";
import { homeDe } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Vuelve de Google: valida el state, cambia el code por el email, chequea el dominio,
// asegura el usuario (auto-provisión "pendiente" si es nuevo) y setea la sesión.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const url = req.nextUrl;

  if (url.searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?error=google`);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = req.cookies.get("g_state")?.value;
  if (!code || !state || !saved || state !== saved) {
    return NextResponse.redirect(`${origin}/login?error=state`);
  }

  try {
    const gu = await intercambiarCodigo(origin, code);
    if (!gu.emailVerified || !dominioPermitido(gu.email, gu.hd)) {
      return NextResponse.redirect(`${origin}/login?error=dominio`);
    }
    const u = await ensureUsuario(gu.email);
    const res = NextResponse.redirect(`${origin}${homeDe(u.rol)}`);
    res.cookies.set(COOKIE, await firmarSesion(u.email), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch {
    return NextResponse.redirect(`${origin}/login?error=google`);
  }
}
