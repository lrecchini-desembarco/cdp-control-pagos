# Notificaciones

Para que **lo urgente llegue solo**, sin entrar a mirar. Arma un resumen de las
**alertas operativas** (críticas + altas) más los **problemas críticos de catálogo**
(precio $0) y lo manda por el canal configurado.

## Configuración

En `.env.local`:

```
NOTIFY_CHANNEL=slack            # "slack" | "none"
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

- **none** (default): no envía; `/api/notify` devuelve el texto como *preview* (sirve
  para ver el formato sin webhook).
- **slack**: postea el resumen al Incoming Webhook (Slack → Apps → *Incoming Webhooks*).
- ¿Mail? Es un adapter más en `lib/notify.ts` (mismo patrón que Slack) cuando definas
  el proveedor (SMTP / Resend / etc.).

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
  (`slack` / `none`) y `enviarResumen()`.
- `app/api/notify/route.ts` — `GET`/`POST` que envían y devuelven el resultado.
