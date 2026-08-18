# IPs libres (servidor propio de la empresa)

Con las IPs fijas por dispositivo, sistemas quiere ver de un vistazo qué IPs están
libres para asignar. Ese escaneo lo hace **un servidor propio dentro de la
empresa** (no esta app): un proceso que corre 24/7 en la red interna y sabe qué
direcciones están libres. El dashboard **solo lo consulta**, mismo espíritu que el
bridge de Tango (`docs/tango-bridge.md`): Vercel no llega a la red interna, así
que hace falta publicar una URL alcanzable (túnel) o una fija (VPN / reverse proxy).

```
Vercel (app)  ──HTTPS──>  túnel / URL fija  ──>  servidor de IPs (red interna)
              GET /ip-libres (admin)          GET /ips-libres (con secreto)
```

## Qué tiene que exponer el servidor

Un endpoint `GET /ips-libres` que devuelva JSON con las IPs libres, en cualquiera
de estas formas (la app tolera las tres):

```json
["192.168.1.50", "192.168.1.62"]
```
```json
{ "ips": ["192.168.1.50", "192.168.1.62"] }
```
```json
{ "ips": [{ "ip": "192.168.1.50", "red": "192.168.1.0/24", "vistoLibreEn": "2026-08-19T10:00:00Z" }] }
```

Si se manda el header `x-ip-libres-secret` con el valor de `IP_LIBRES_SECRET`, el
servidor debe validarlo y rechazar si no coincide (401).

## Cómo se conecta

**Opción A — URL fija** (VPN, IP pública con firewall, reverse proxy interno):
```
IP_LIBRES_URL=https://ip-server.tudominio.local
IP_LIBRES_SECRET=un-token-largo-y-secreto      # opcional, pero recomendado
```

**Opción B — túnel que cambia de URL** (Cloudflare Tunnel gratis, igual que el
bridge de Tango): un watchdog en esa máquina publica la URL vigente en el
dashboard cada vez que levanta un túnel nuevo, así nunca hay que tocar Vercel.

```bash
curl -X POST https://<tu-app>.vercel.app/api/ip-libres-url \
  -H "x-tunel-secreto: <TUNEL_ADMIN_SECRETO>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://algo-al-azar.trycloudflare.com"}'
```

`TUNEL_ADMIN_SECRETO` es el mismo secreto que ya usan el bridge de Tango y el
admin de precios (ver `docs/tango-bridge.md`) — autoriza solo a *publicar* la URL,
no a leer IPs: eso lo sigue guardando `IP_LIBRES_SECRET` en el propio servidor.

## Ver el resultado

**Sistema → IPs libres** (solo admin). Se refresca sola cada 30 segundos y tiene
un botón para actualizar al toque. Si no hay URL configurada (ni por KV ni por
env), avisa "Sin configurar" en vez de romper.

## Asignar una IP a un equipo

Copiala desde esta pantalla y pegala en el campo **IP** del equipo, en
**Inventario → Inventario** (o **Disponibles** si todavía no tiene usuario). Ese
campo es de texto libre: la app no valida que la IP esté realmente libre en la red
en ese momento — la fuente de verdad sigue siendo el servidor propio.
