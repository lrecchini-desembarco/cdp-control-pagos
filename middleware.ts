import { NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth-cookie";

// Protege las páginas: sin sesión -> al login. Las /api quedan fuera (el cron de
// notificaciones necesita pegarles). El gating por rol se hace en el layout
// server-side (lee el store, fuente de verdad). Pasa el pathname al layout.
// Pantallas públicas de la TV (sin login) — se sirven sin el layout de la app.
const PUBLICAS = ["/cartelera", "/tv"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const esPublica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const tieneSesion = Boolean(req.cookies.get(COOKIE)?.value);

  if (!tieneSesion && !esPublica) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // /review (QR) queda fuera del middleware; /cartelera y /tv pasan pero como públicas.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|review).*)"],
};
