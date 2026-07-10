import { NextRequest, NextResponse } from "next/server";
import { googleConfigurado, authUrl } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// Arranca el login con Google: genera un state anti-CSRF y manda al consent de Google.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!googleConfigurado()) {
    return NextResponse.redirect(`${origin}/login?error=google_no_config`);
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set("g_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
