import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// La PC de carga empuja acá ventas/precios de Tango (comprimidos) y el dashboard
// los lee del KV — sin túnel de entrada. Autenticado con el mismo secreto que el
// locator del bridge (x-tunel-secreto = TUNEL_ADMIN_SECRETO).

export async function GET() {
  // Diagnóstico: cuándo fue el último push y qué días hay.
  const fresh = await readStore<{ cuando?: string; dias?: string[] } | null>("tango-fresh", null);
  return NextResponse.json({ ok: true, ...(fresh ?? { cuando: null, dias: [] }) });
}

export async function POST(req: Request) {
  const secreto = process.env.TUNEL_ADMIN_SECRETO;
  if (!secreto || req.headers.get("x-tunel-secreto") !== secreto) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    if (body.tipo === "ventas" && typeof body.dia === "string" && typeof body.data === "string") {
      await writeStore(`tango-ventas:${body.dia}`, body.data);
    } else if (body.tipo === "precios" && typeof body.data === "string") {
      await writeStore("tango-precios", body.data);
    } else if (body.tipo === "fresh") {
      await writeStore("tango-fresh", { cuando: new Date().toISOString(), dias: body.dias ?? [] });
    } else {
      return NextResponse.json({ ok: false, error: "payload inválido" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
