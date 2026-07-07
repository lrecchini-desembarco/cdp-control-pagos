import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// Locator del bridge de Tango. El watchdog de la máquina (scripts/tango-tunel-loop)
// publica acá la URL del túnel vigente cada vez que levanta uno nuevo. El dashboard
// lee esta URL del KV (lib/bridge-url), así NUNCA hay que tocar Vercel ni importa
// que la URL del túnel cambie o que un plan gratis tenga tope de tráfico.

interface BridgeUrl {
  url: string;
  cuando: string;
}

// GET: para diagnóstico (qué URL tiene guardada el dashboard).
export async function GET() {
  const dato = await readStore<BridgeUrl | null>("bridge-url", null);
  return NextResponse.json({ ok: true, ...(dato ?? { url: null, cuando: null }) });
}

// POST { url } con header x-tunel-secreto -> guarda la URL vigente del bridge.
export async function POST(req: Request) {
  const secreto = process.env.TUNEL_ADMIN_SECRETO;
  if (!secreto || req.headers.get("x-tunel-secreto") !== secreto) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url)) {
    return NextResponse.json({ ok: false, error: "url inválida" }, { status: 400 });
  }
  await writeStore<BridgeUrl>("bridge-url", { url: url.replace(/\/+$/, ""), cuando: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
