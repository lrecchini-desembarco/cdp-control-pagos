import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { iguales } from "@/lib/auth-cookie";

export const dynamic = "force-dynamic";

// Locator del admin de carga de precios de la web: URL FIJA que redirige
// al túnel vigente. El watchdog de la máquina de carga (desembarco-web/
// scripts/tunel-admin.mjs) publica acá la URL cada vez que levanta un
// túnel nuevo, así el equipo guarda un solo link para siempre.

interface AdminWebUrl {
  url: string;
  cuando: string;
}

export async function GET() {
  const dato = await readStore<AdminWebUrl | null>("admin-web-url", null);
  if (!dato?.url) {
    return new NextResponse(
      "El admin de precios no está publicado en este momento (¿la máquina de carga está apagada?). Reintentá en unos minutos.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  return NextResponse.redirect(`${dato.url}/admin/precios`, 302);
}

export async function POST(req: Request) {
  const secreto = process.env.TUNEL_ADMIN_SECRETO;
  if (!secreto || !iguales(req.headers.get("x-tunel-secreto") ?? "", secreto)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url)) {
    return NextResponse.json({ ok: false, error: "url inválida" }, { status: 400 });
  }
  await writeStore<AdminWebUrl>("admin-web-url", { url, cuando: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
