import { NextResponse } from "next/server";
import { enviarResumen } from "@/lib/notify";
import { cronOAdmin } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// POST /api/notify  -> envía el resumen por el canal configurado (botón en Alertas)
// GET  /api/notify  -> idem (para disparar por cron). Ver docs/notificaciones.md.
// Autorizado solo para el cron (CRON_SECRET) o un admin logueado: manda emails.
async function handler(req: Request) {
  if (!(await cronOAdmin(req))) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
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
