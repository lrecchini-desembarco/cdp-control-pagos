# Deploy a Vercel — checklist

Pasos para publicar `cdp-control` en Vercel y que quede funcional.

## 1) Importar el proyecto
- Vercel → **Add New → Project** → importar el repo `lrecchini-desembarco/cdp-control`.
- Framework: **Next.js** (lo detecta solo). Build `next build`. No tocar nada más.

## 2) Variables de entorno (Project → Settings → Environment Variables)

**a. Base — siempre (entorno Production):**
```
APP_PASSWORD=cdp2026
DATA_SOURCE=mock
NEXT_PUBLIC_PUBLIC_URL=https://cdp-control.vercel.app
NEXT_PUBLIC_FIRMAS_URL=https://lrecchini-desembarco.github.io/firmas-eldesembarco/
```
> Si el dominio final es otro, poné ese en `NEXT_PUBLIC_PUBLIC_URL` (el QR apunta ahí).

**b. Persistencia (Vercel KV):** las **setea solas** la integración de Storage (ver paso 3):
```
KV_REST_API_URL=...        (automática)
KV_REST_API_TOKEN=...      (automática)
```

**c. Tango real (Ventas por turno + Precios) — vía bridge:** la app en la nube no
llega al SQL interno; lee un bridge HTTP publicado por Cloudflare Tunnel
(ver `docs/tango-bridge.md`). Con estas, Ventas y Precios pasan a datos reales:
```
VENTAS_SOURCE=live
PRECIOS_SOURCE=live
TANGO_BRIDGE_URL=https://<tu-tunel>.trycloudflare.com   (la URL del túnel)
TANGO_BRIDGE_SECRET=<el mismo BRIDGE_SECRET del bridge>
```
> Sin estas, Ventas y Precios muestran datos de ejemplo (mock) y lo indican con un badge.
> El **Cruce** además necesita `RAVEN_TOKEN` (pedidos reales) para ser útil.

**d. Notificaciones por email — Google Workspace (opcional):**
```
NOTIFY_CHANNEL=email
SMTP_USER=notificaciones@eldesembarco.com   # casilla que envía
SMTP_PASS=xxxxxxxxxxxxxxxx                   # App Password (16 chars, 2FA)
NOTIFY_EMAIL_TO=rrhh@eldesembarco.com,admin@eldesembarco.com
```
Ver detalle en `docs/notificaciones.md`.

### Resumen: qué variable prende qué
| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `APP_PASSWORD` | Clave genérica de login | Sí |
| `NEXT_PUBLIC_PUBLIC_URL` | Dominio al que apunta el QR de Reseñas | Sí |
| `NEXT_PUBLIC_FIRMAS_URL` | Generador de firmas embebido | Recomendada |
| `DATA_SOURCE=mock` | Default de todas las fuentes | Sí |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Persistencia (locales, reseñas, usuarios) | Recomendada (auto) |
| `VENTAS_SOURCE=live` | Ventas por turno reales (Tango) | Solo para Tango |
| `PRECIOS_SOURCE=live` | Precios reales (Tango) | Solo para Tango |
| `TANGO_BRIDGE_URL` / `TANGO_BRIDGE_SECRET` | Puente al SQL interno | Solo para Tango |
| `RAVEN_TOKEN` | Pedidos reales (Cruce) | Solo para Cruce |
| `NOTIFY_CHANNEL=email` + `SMTP_USER`/`SMTP_PASS`/`NOTIFY_EMAIL_TO` | Notificaciones por email (Workspace) | Opcional |

## 3) Persistencia — provisionar Vercel KV  ⚠️ importante
- Project → **Storage** → crear una base **KV** (Upstash) y conectarla al proyecto.
- La integración **setea sola** `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
- Sin KV: el sitio igual **muestra** los 109 locales (seed), pero **no guarda** cambios
  (agregar local, derivaciones, usuarios, mapeos). Con KV, guarda todo.

## 4) Deploy
- Deploy. Listo.

## 5) Smoke test (post-deploy)
- `/login` → entrar con `lrecchini@eldesembarco.com` / `cdp2026` (admin).
- **Resumen** carga; **Reseñas** muestra los 109 locales y la reputación de Google.
- **/review** (sin login, en el celular): elegir local → "Calificar en Google" → abre Google Maps.
- Agregar un local de prueba en la consola → si queda guardado tras refrescar, **KV anda**.
- Imprimir un QR (póster) — el QR ya apunta al dominio real.

## 6) Notificaciones automáticas (opcional)
- Ya hay un **cron** (`vercel.json`) que pega a `/api/notify` 1 vez por día (12:00 UTC ≈ 9:00 ART).
- Para que **envíe**: agregar `NOTIFY_CHANNEL=email` + `SMTP_USER`/`SMTP_PASS`/`NOTIFY_EMAIL_TO`.
- Sin eso, el cron corre pero no manda nada (no molesta).

## Qué queda real vs mock
| Sección | Estado en el deploy |
|---|---|
| Login, roles, navegación | ✅ real |
| Reseñas (QR, locales, reputación Google, derivaciones) | ✅ real (con KV guarda) |
| Firmas, Comunicados, Guía | ✅ real |
| **Ventas por turno** | ✅ real con `VENTAS_SOURCE=live` + bridge |
| **Precios** | ✅ real con `PRECIOS_SOURCE=live` + bridge |
| **Cruce** | 🟡 mock hasta tener `RAVEN_TOKEN` (pedidos) |
| **Catálogo** | 🟡 mock — las listas de Tango están vacías (ver `docs/precios.md`) |

## Conectar Tango (Ventas + Precios) en producción
Vercel no llega al SQL interno → se usa un **bridge HTTP** en la red de la empresa,
publicado con **Cloudflare Tunnel**. Guía completa: **`docs/tango-bridge.md`**.
Resumen: crear las vistas (`lib/sources/tango.queries.sql` + `precios.queries.sql`),
dejar el bridge corriendo 24/7 (tarea de Windows) + el túnel, y en Vercel setear
`VENTAS_SOURCE=live`, `PRECIOS_SOURCE=live`, `TANGO_BRIDGE_URL`, `TANGO_BRIDGE_SECRET`.
