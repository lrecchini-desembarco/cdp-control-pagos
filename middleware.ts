import { NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth-cookie";

// Protege las páginas: sin sesión -> al login. Las /api quedan fuera (el cron de
// notificaciones necesita pegarles). El gating por rol se hace en el layout
// server-side (lee el store, fuente de verdad). Pasa el pathname al layout.
export function middleware(req: NextRequest) {
  const tieneSesion = Boolean(req.cookies.get(COOKIE)?.value);
  const { pathname } = req.nextUrl;

  if (!tieneSesion) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // /review es público (lo abre el consumidor por QR, sin login).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|review).*)"],
};
