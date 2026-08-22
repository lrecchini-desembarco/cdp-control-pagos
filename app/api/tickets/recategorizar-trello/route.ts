import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";
import { trelloConfigurado } from "@/lib/trello";
import { recategorizarDesdeTrello } from "@/lib/tickets-store";

export const dynamic = "force-dynamic";

// Botón "Recategorizar desde Trello" del panel: para los tickets ya
// importados de Trello, vuelve a leer en qué columna está la card HOY y
// actualiza categoría/estado según ese mapeo. Uso: correrlo una vez para
// poner al día los tickets que se importaron antes de que existiera el
// mapeo columna→categoría (por eso quedaron en "Otro" aunque en Trello ya
// estén resueltos). Solo quien tiene acceso al Panel de Sistemas.
export async function POST() {
  const s = await getSesion();
  if (!s || !(await puedeVerPanelSistemas(s.email))) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  if (!trelloConfigurado()) {
    return NextResponse.json({ ok: false, error: "Trello no está configurado todavía." }, { status: 501 });
  }
  try {
    const { items, actualizados, sinCard } = await recategorizarDesdeTrello();
    return NextResponse.json({ ok: true, items, actualizados, sinCard });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo recategorizar." }, { status: 502 });
  }
}
