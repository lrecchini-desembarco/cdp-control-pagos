import { NextResponse } from "next/server";
import { enviarResumen } from "@/lib/notify";

export const dynamic = "force-dynamic";

// POST /api/notify  -> envía el resumen por el canal configurado (botón en Alertas)
// GET  /api/notify  -> idem (para disparar por cron). Ver docs/notificaciones.md.
async function handler() {
  try {
    const r = await enviarResumen();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[notify] error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "No se pudo enviar la notificación." },
      { status: 502 }
    );
  }
}

export const GET = handler;
export const POST = handler;
