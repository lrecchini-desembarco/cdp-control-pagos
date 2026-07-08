# Notificaciones

Para que **lo urgente llegue solo**, sin entrar a mirar. Arma un resumen de las
**alertas operativas** (críticas + altas) más los **problemas críticos de catálogo**
(precio $0) y lo manda por el canal configurado.

## Configuración

En `.env.local` (o variables de entorno en Vercel):

```
NOTIFY_CHANNEL=email            # "email" | "slack" | "none"

# --- email (Google Workspace / Gmail por SMTP) ---
SMTP_USER=notificaciones@eldesembarco.com   # casilla que envía
SMTP_PASS=xxxxxxxxxxxxxxxx                   # App Password de esa casilla (16 chars, requiere 2FA)
NOTIFY_EMAIL_TO=rrhh@eldesembarco.com,admin@eldesembarco.com   # destinatarios (coma)
# opcionales:
# NOTIFY_EMAIL_FROM=...        # default = SMTP_USER
# SMTP_HOST=smtp.gmail.com     # default
# SMTP_PORT=465                # default (465 = SSL; 587 = STARTTLS)

# --- slack ---
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

- **none** (default): no envía; `/api/notify` devuelve el texto como *preview*.
- **email** (Google Workspace): manda por SMTP `smtp.gmail.com` autenticando con una
  casilla del dominio + **App Password**. Cómo sacar el App Password: la casilla debe
  tener **verificación en 2 pasos** activada → cuenta de Google → *Seguridad* →
  *Contraseñas de aplicaciones* → generás una de 16 caracteres y la ponés en `SMTP_PASS`.
  El secreto va SOLO como variable de entorno; no se hardcodea en el repo.
- **slack**: postea al Incoming Webhook (Slack → Apps → *Incoming Webhooks*).

## Cómo se dispara

1. **Manual, desde la app** — botón **"Enviar resumen ahora"** en `/alertas`.
   Útil para probar la config y para mandar el estado del día a demanda.
2. **Automático, por cron** — pegarle a `GET /api/notify` en un horario:
   - **Vercel Cron** (`vercel.json`):
     ```json
     { "crons": [{ "path": "/api/notify", "schedule": "0 9 * * *" }] }
     ```
   - O un cron externo / la rutina de Claude Code (skill `schedule`) que haga el GET.

## Qué manda

```
*CDP · Control — resumen*
🔴 2 críticas · 🟠 8 altas · catálogo: 4 con precio $0

*Alertas operativas:*
• 🔴 Posible quiebre de Medallón Tuki 80g en Pilar (-24,1%)
• 🟠 Sobre-pedido de Bolas Blend 100g en Flores (+18%)
…

*Catálogo (crítico):*
• 🔴 Doble cuarto con queso 55gr (138078) — precio-cero
…
```

Si no hay nada urgente, manda un "✅ Todo en orden".

## Implementación

- `lib/notify.ts` — `construirResumen()` (junta alertas + catálogo), notifiers
  (`email` / `slack` / `none`), `enviarResumen()` y `notificar(texto, {subject})`
  (mensaje suelto reutilizable).
- `app/api/notify/route.ts` — `GET`/`POST` que envían y devuelven el resultado.

## Otros avisos que usan el mismo canal

- **Nuevo ingreso al organigrama**: al dar de alta una persona en `/organigrama`
  (checkbox "Avisar el ingreso"), se manda por el canal configurado con
  `notificar(...)`. Asunto: *"Nuevo ingreso: {nombre} — {cargo}"*. Nunca frena el alta
  si el envío falla.
