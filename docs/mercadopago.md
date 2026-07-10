# Cobros de Mercado Pago (API)

Trae lo que **cobró Mercado Pago** (pagos aprobados) para verlo por medio de pago y día,
y —cuando esté la vista de cobros de Tango— **conciliarlo** contra lo que Tango registró.

Solo lectura de pagos. La API de MP se llama **solo en el refresco** (cron), se agrega
por día y se cachea en KV; la pantalla lee el cache (nunca pega a MP directo).

## Configuración

En **Vercel → proyecto → Settings → Environment Variables**:
```
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...   # access token de PRODUCCIÓN de la cuenta MP
```
De dónde sale: [mercadopago.com.ar](https://www.mercadopago.com.ar) → **Tu negocio → Configuración
→ Gestión y administración → Credenciales de producción** → *Access token*. Es de la cuenta
que recibe los cobros. El token va SOLO como variable de entorno; no se hardcodea.

Después de cargarlo: **redeploy**, y forzá el primer refresco entrando a
`…/api/mercadopago/refresh?dias=8` (o esperá al cron).

## Cómo se actualiza
- Cron diario (ver `vercel.json`) refresca los últimos ~8 días (los recientes cambian
  cuando entran pagos). En plan Pro se puede subir a cada hora.
- Manual: `GET /api/mercadopago/refresh?dias=8`.

## Conciliación con Tango (siguiente paso)
Para cruzar MP contra lo que Tango registró como cobrado por QR/MP hace falta la vista
`dbo.vw_CobrosDiarios` con permiso para `cdp_lectura` (está en `docs/pedido-sistemas.md`).
Apenas esté, se activa la comparación día por día.

## Mapeo store → local
Los pagos de MP traen `store_id` / `pos_id`. Para mostrar los cobros **por local** hay
que mapear cada `store_id` de MP al local correspondiente (namespaces distintos). La
pantalla ya lista los `store_id` crudos con su monto para armar ese mapeo cuando haya
datos reales.

## Implementación
- `lib/mercadopago.ts` — `fetchCobrosDia()` (search de pagos aprobados, paginado, agregado).
- `lib/mercadopago-store.ts` — cache por día + `refrescarMP()` + lectura.
- `app/api/mercadopago` (lectura) y `app/api/mercadopago/refresh` (cron).
- `components/views/MercadoPagoView.tsx` + `/mercadopago`.
