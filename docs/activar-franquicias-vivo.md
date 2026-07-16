# Activar la cuenta corriente de FRANQUICIAS en vivo (Tango)

Deja la pantalla **Franquicias · Cuentas Corrientes** leyendo la deuda directamente
de Tango (sin subir Excel), actualizándose sola cada ~1 hora. Requisito ya cumplido:
la vista `vw_FranquiciasCtaCte` existe en `CENTRAL_ESTADISTICA` y `cdp_lectura` la lee.

Son 3 pasos, una sola vez.

---

## 1) En la PC de carga (la que llega a SRVTANGO y corre el bridge/push)

Es la misma PC donde ya corre el envío de ventas de Tango.

1. Abrí la carpeta del proyecto (donde está el repo `ds-cdp-dashboard`).
2. Traé el código nuevo:
   ```
   git pull
   ```
3. Reiniciá el proceso de envío para que tome el código nuevo. Lo más simple:
   **reiniciá la PC** — al prender, el arranque automático levanta el bridge, el
   túnel y el push ya actualizados.
   *(Alternativa sin reiniciar: en el Administrador de tareas, terminá los procesos
   `node.exe` del push; el watchdog los relanza solos en ~15 seg con el código nuevo.)*

Con eso, el push empieza a mandar la cta cte de franquicias al dashboard (aparece en
el KV como `tango-franquicias`). Se puede confirmar mirando `tango-push.log`: debe
decir `... + N franquicias`.

---

## 2) En Vercel (panel web) — prender el interruptor

En el proyecto **cdp-control-pagos** → **Settings → Environment Variables**, agregá:

```
FRANQUICIAS_SOURCE = live
```

(Environment: Production.) Guardá y **Redeploy** (Deployments → ⋯ → Redeploy) para
que tome la variable.

---

## 3) Verificar

Entrá a `/franquicias`. En el encabezado tiene que aparecer el chip **● en vivo · Tango**
(en vez de "se carga a mano"). Los números deben coincidir con Tango:
deuda ~$512M, y en "Por concepto": Regalías / CDP / Gestión apps / Marketing / Acuerdo.

---

## Notas

- **Vuelta atrás:** si algo no cierra, sacá la variable `FRANQUICIAS_SOURCE` (o ponela
  en `upload`) y el dashboard vuelve a usar el último Excel subido. Nada se pierde.
- **La gestión sobrevive:** cobros, estados, contactos, notas y el maestro se
  **superponen** sobre el dato vivo (van keyed por comprobante) — no se borran al
  refrescar desde Tango.
- **Concepto:** sale del artículo de la factura (mercadería → CDP; artículo de
  regalías/marketing/gestión de apps → ese concepto). Automático, sin tocar nada.
- **Pendiente menor:** el "local" de Tango viene "Casa central" para todos; las
  solapas por-local se afinan cruzando con el nombre de local de Raven (por CUIT).
