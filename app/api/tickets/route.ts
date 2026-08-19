import { NextRequest, NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";
import { getTickets, getTicketsDe, getTicket, crearTicket, actualizarTicket, comentarTicket } from "@/lib/tickets-store";

export const dynamic = "force-dynamic";

// Tickets a sistemas: cualquier cuenta logueada puede abrir uno y comentar en
// el propio (o en cualquiera si tiene acceso al Panel de Sistemas). Cambiar
// estado/asignado/prioridad es solo para quien tiene ese acceso — la lista
// blanca dinámica de lib/panel-sistemas-store.ts, no un rol fijo.

export async function GET() {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
  const esSistemas = await puedeVerPanelSistemas(s.email);
  const items = esSistemas ? await getTickets() : await getTicketsDe(s.email);
  return NextResponse.json({ ok: true, items, esSistemas });
}

export async function POST(req: NextRequest) {
  const s = await getSesion();
  if (!s) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });

  try {
    const body = await req.json();

    // Alta: sin id, cualquier cuenta logueada.
    if (!body?.id) {
      const { items } = await crearTicket(body, s.email);
      return NextResponse.json({ ok: true, items });
    }

    const ticket = await getTicket(String(body.id));
    if (!ticket) return NextResponse.json({ ok: false, error: "No existe ese ticket." }, { status: 404 });
    const esSistemas = await puedeVerPanelSistemas(s.email);
    const esSolicitante = ticket.solicitante.toLowerCase() === s.email.toLowerCase();

    // Comentario: el que lo abrió, o sistemas.
    if (typeof body.comentario === "string") {
      if (!esSolicitante && !esSistemas) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
      const items = await comentarTicket(String(body.id), body.comentario, s.email, esSistemas);
      return NextResponse.json({ ok: true, items });
    }

    // Cambios de gestión (estado/asignado/prioridad): solo sistemas.
    if (!esSistemas) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 });
    const items = await actualizarTicket(String(body.id), body);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }, { status: 400 });
  }
}
