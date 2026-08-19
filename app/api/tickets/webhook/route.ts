import { NextRequest, NextResponse } from "next/server";
import { iguales } from "@/lib/auth-cookie";
import { crearTicket } from "@/lib/tickets-store";
import type { PrioridadTicket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

// Alta de tickets desde afuera (hoy: n8n, cuando el flujo de WhatsApp crea la
// tarjeta de Trello). No hay sesión de usuario acá — se autentica con un
// secreto compartido en el header, mismo patrón que el resto de las
// integraciones externas de esta app (bridge de Tango, IPs libres).
//
// POST /api/tickets/webhook
// Header: x-tickets-secret: <TICKETS_WEBHOOK_SECRET>
// Body:
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
export async function POST(req: NextRequest) {
  const secreto = process.env.TICKETS_WEBHOOK_SECRET;
  if (!secreto || !iguales(req.headers.get("x-tickets-secret") ?? "", secreto)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json();
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
