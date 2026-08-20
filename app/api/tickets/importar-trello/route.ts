import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";
import { trelloConfigurado, listarCardsTablero } from "@/lib/trello";
import { importarDesdeTrello } from "@/lib/tickets-store";

export const dynamic = "force-dynamic";

// Botón "Sincronizar con Trello" del panel: trae las cards abiertas del
// tablero y crea un ticket por cada una que todavía no exista (dedup por
// shortLink de la card). Solo quien tiene acceso al Panel de Sistemas.
export async function POST() {
  const s = await getSesion();
  if (!s || !(await puedeVerPanelSistemas(s.email))) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  }
  if (!trelloConfigurado()) {
    return NextResponse.json({ ok: false, error: "Trello no está configurado todavía." }, { status: 501 });
  }
  try {
    const cards = await listarCardsTablero();
    const { items, agregados } = await importarDesdeTrello(cards);
    return NextResponse.json({ ok: true, items, agregados });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo importar." }, { status: 502 });
  }
}
