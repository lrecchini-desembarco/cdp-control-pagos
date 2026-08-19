# Tickets desde WhatsApp (n8n → dashboard)

Los tickets hoy nacen en un grupo de WhatsApp, un flujo de n8n los toma y crea
una tarjeta en Trello. Este endpoint agrega un paso más a ESE flujo (no lo
reemplaza): cuando n8n crea la tarjeta, también crea el ticket en
**Sistema → Panel de Sistemas → Tickets**, para que sistemas los vea junto con
los que se abren desde la web (`/tickets`), en un solo lugar.

No hay sincronización de vuelta (por ahora): lo que se comenta o resuelve en
el dashboard no se refleja en Trello. Es un paso más en el flujo existente,
no una integración de ida y vuelta.

## Node a agregar en n8n

Después del nodo que crea la tarjeta de Trello, un **HTTP Request**:

- **Método**: `POST`
- **URL**: `https://<tu-app>.vercel.app/api/tickets/webhook`
- **Headers**: `x-tickets-secret: <TICKETS_WEBHOOK_SECRET>`
- **Body** (JSON):
  ```json
  {
    "titulo": "{{ $json.tituloDelMensaje }}",
    "descripcion": "{{ $json.textoDelMensaje }}",
    "solicitante": "WhatsApp: {{ $json.nombreRemitente }} ({{ $json.telefono }})",
    "categoria": "Hardware",
    "prioridad": "media",
    "trelloUrl": "{{ $json.urlTarjetaTrello }}"
  }
  ```

| Campo | Obligatorio | Notas |
|---|---|---|
| `titulo` | Sí | Lo que se ve en la tabla del panel. |
| `descripcion` | Sí | El cuerpo del mensaje de WhatsApp, o un resumen. |
| `solicitante` | Sí | Texto libre — no es un email, es solo para identificar quién escribió. Sugerido: `"WhatsApp: <nombre> (<teléfono>)"`. |
| `categoria` | No (default `"Otro"`) | Una de: `Hardware`, `Software`, `Red / IP / WiFi`, `Accesos y contraseñas`, `Otro`. Si n8n no puede clasificarlo, dejalo vacío. |
| `prioridad` | No (default `"media"`) | `baja` \| `media` \| `alta` \| `urgente`. |
| `trelloUrl` | No | Si se manda, en el panel aparece un link "Ver en Trello ↗" en esa fila. |

## Respuesta

```json
{ "ok": true, "id": "mt09l9oaelcch", "nro": 1 }
```

`nro` es el mismo número que ve sistemas en la tabla (`#1`, `#2`...). Si el
flujo quiere, puede agregar un paso más después de este para comentar en la
tarjeta de Trello algo como `"Ticket #1 en el dashboard"` — no es necesario,
pero cierra el círculo para quien mira Trello.

Si falta el secreto o no coincide, responde `401`. Si falta `titulo`,
`descripcion` o `solicitante`, responde `400` con el motivo en `error`.

## Variable de entorno

```
TICKETS_WEBHOOK_SECRET=un-token-largo-y-secreto
```

Se configura en Vercel (Settings → Environment Variables) y en el nodo HTTP
Request de n8n — tiene que ser el mismo valor de los dos lados, como el
`BRIDGE_SECRET` del bridge de Tango.

## Implementación

`app/api/tickets/webhook/route.ts` — único endpoint que acepta este alta;
reusa `crearTicket()` de `lib/tickets-store.ts` con `origen: "whatsapp"`.
