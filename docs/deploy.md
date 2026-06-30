# Deploy a Vercel — checklist

Pasos para publicar `cdp-control` en Vercel y que quede funcional.

## 1) Importar el proyecto
- Vercel → **Add New → Project** → importar el repo `lrecchini-desembarco/cdp-control`.
- Framework: **Next.js** (lo detecta solo). Build `next build`. No tocar nada más.

## 2) Variables de entorno (Project → Settings → Environment Variables)
```
APP_PASSWORD=cdp2026
DATA_SOURCE=mock
NEXT_PUBLIC_PUBLIC_URL=https://cdp-control.vercel.app
NEXT_PUBLIC_FIRMAS_URL=https://lrecchini-desembarco.github.io/firmas-eldesembarco/
```
> Si el dominio final es otro, poné ese en `NEXT_PUBLIC_PUBLIC_URL` (el QR apunta ahí).

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
- Para que **envíe**: agregar `NOTIFY_CHANNEL=slack` y `SLACK_WEBHOOK_URL=...`.
- Sin eso, el cron corre pero no manda nada (no molesta).

## Qué queda real vs mock
| Sección | Estado en el deploy |
|---|---|
| Login, roles, navegación | ✅ real |
| Reseñas (QR, 109 locales, reputación Google, derivaciones) | ✅ real (con KV guarda) |
| Firmas, Guía | ✅ real |
| **Cruce / Ventas por turno / Catálogo / Alertas** | 🟡 **mock** hasta conectar Tango |

## Conectar datos reales del CDP (Tango)
Cuando haya acceso al SQL Server de Tango: seguir **`docs/conectar-tango.md`**
(crear vistas + usuario read-only, `DATA_SOURCE=live`, `TANGO_DB_*`). Ojo: Vercel
no llega a una IP interna — hay que resolver el puente (VPN/túnel) o correr ese
lado on-prem. Detalle en ese doc.
