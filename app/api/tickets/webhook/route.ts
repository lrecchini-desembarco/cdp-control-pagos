import { NextRequest, NextResponse } from "next/server";
import { iguales } from "@/lib/auth-cookie";
import { crearTicket, comentarTicket, getTicket } from "@/lib/tickets-store";
import type { PrioridadTicket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

// Alta de tickets desde afuera (hoy: n8n, cuando el flujo de WhatsApp crea la
// tarjeta de Trello). No hay sesión de usuario acá — se autentica con un
// secreto compartido en el header, mismo patrón que el resto de las
// integraciones externas de esta app (bridge de Tango, IPs libres).
//
// POST /api/tickets/webhook
// Header: x-tickets-secret: <TICKETS_WEBHOOK_SECRET>
//
// Alta (ticket nuevo) — sin "id":
//   {
//     "titulo": "...",              (obligatorio)
//     "descripcion": "...",         (obligatorio)
//     "solicitante": "WhatsApp: Sabrina (+54 9 221 555-1234)",  (obligatorio: quién escribió)
//     "categoria": "Hardware",      (opcional, default "Otro")
//     "prioridad": "media",         (opcional, default "media")
//     "trelloUrl": "https://trello.com/c/abc123"  (opcional: link a la tarjeta ya creada)
//   }
// Respuesta: { ok: true, id, nro } — nro es el mismo número que ve sistemas
// en /panel-sistemas/tickets; sirve para, por ejemplo, comentarlo en la
// tarjeta de Trello ("Ticket #45 en el dashboard").
//
// Seguimiento (el mismo usuario escribe otra vez en el mismo hilo) — con "id"
// (el que devolvió el alta): se agrega como comentario del solicitante en vez
// de crear un ticket nuevo. Si sistemas había cerrado la conversación, este
// mensaje la reabre solo (mismo comportamiento que si el solicitante
// comentara desde la web):
//   { "id": "mt09l9oaelcch", "descripcion": "el mensaje que mandó por WhatsApp" }
export async function POST(req: NextRequest) {
  const secreto = process.env.TICKETS_WEBHOOK_SECRET;
  if (!secreto || !iguales(req.headers.get("x-tickets-secret") ?? "", secreto)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Seguimiento sobre un ticket que ya existe: se agrega como mensaje del
    // solicitante (no de sistemas), así reabre la conversación si estaba cerrada.
    if (body?.id) {
      const existente = await getTicket(String(body.id));
      if (!existente) return NextResponse.json({ ok: false, error: "No existe ese ticket." }, { status: 404 });
      await comentarTicket(String(body.id), body?.descripcion, existente.solicitante, false);
      return NextResponse.json({ ok: true, id: existente.id, nro: existente.nro });
    }

    const solicitante = String(body?.solicitante ?? "").trim();
    if (!solicitante) return NextResponse.json({ ok: false, error: "Falta solicitante." }, { status: 400 });

    const { creado } = await crearTicket(
      {
        titulo: body?.titulo,
        descripcion: body?.descripcion,
        categoria: body?.categoria,
        prioridad: body?.prioridad as PrioridadTicket,
        origen: "whatsapp",
        trelloUrl: body?.trelloUrl,
      },
      solicitante
    );
    return NextResponse.json({ ok: true, id: creado.id, nro: creado.nro });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo crear el ticket." }, { status: 400 });
  }
}
