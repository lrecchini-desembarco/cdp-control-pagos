# Bridge Tango → Vercel (Cloudflare Tunnel)

Vercel corre en la nube y **no llega al SQL Server interno** (`SRVTANGO\AXSQLEXPRESS`,
red 192.168.x). Para que la app deployada lea ventas reales, corremos un **bridge
HTTP** en una máquina de la red de la empresa y lo publicamos con **Cloudflare Tunnel**.
Vercel le pega a esa URL (no al SQL directo → más seguro: solo expone ventas, con secreto).

```
Vercel (app)  ──HTTPS──>  Cloudflare Tunnel  ──>  bridge (red interna)  ──>  SQL Tango
                                                   GET /ventas (con secreto)   vw_VentasInsumoDiaria
```

## 1. En una máquina de la red interna (la que llega a SRVTANGO)

Requisitos: Node 18+, el repo clonado, `npm install` hecho.

`.env.local` con las credenciales de Tango + un secreto largo:
```
TANGO_DB_HOST=SRVTANGO
TANGO_DB_INSTANCE=AXSQLEXPRESS      # o TANGO_DB_PORT=1433 si la instancia escucha ahí
TANGO_DB_NAME=CENTRAL_ESTADISTICA
TANGO_DB_USER=cdp_lectura
TANGO_DB_PASSWORD=********
TANGO_DB_TRUST_CERT=true
BRIDGE_SECRET=un-token-largo-y-secreto      # generá uno random
```

Levantar el bridge:
```bash
npm run bridge        # escucha en http://localhost:8787
```
Probar local: `curl -H "x-bridge-secret: <token>" "http://localhost:8787/ventas?desde=2026-06-01&hasta=2026-06-30"`

## 2. Publicar con Cloudflare Tunnel (gratis)

Instalar `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

**Rápido (URL temporal, para probar):**
```bash
cloudflared tunnel --url http://localhost:8787
```
Da una URL tipo `https://algo-al-azar.trycloudflare.com` (cambia cada vez que reinicia).

**Estable (recomendado para producción):** tunnel con nombre + dominio propio:
```bash
cloudflared tunnel login
cloudflared tunnel create cdp-tango
# Asociar un hostname (ej. tango.tudominio.com) y apuntarlo a http://localhost:8787
cloudflared tunnel route dns cdp-tango tango.tudominio.com
cloudflared tunnel run cdp-tango
```
Para que quede prendido siempre: instalarlo como servicio (`cloudflared service install`).

> El bridge y el túnel tienen que quedar **corriendo 24/7** en esa máquina (o un
> servidorcito de la red). Si se apagan, la app en Vercel deja de ver ventas.

### Dejarlo 24/7 (sin consola abierta)

**Bridge como tarea de Windows.** Dos opciones:

- **Con admin (recomendado para un servidor):** arranca al prender la máquina
  (antes del login), corre como SYSTEM y se reinicia solo.
  ```powershell
  # PowerShell COMO ADMINISTRADOR, en la carpeta del repo:
  powershell -ExecutionPolicy Bypass -File scripts\instalar-bridge-servicio.ps1
  ```
  Desinstalar: `Unregister-ScheduledTask -TaskName "CDP Tango Bridge" -Confirm:$false`

- **Sin admin:** arranca al iniciar sesión tu usuario, oculto (sirve si la
  máquina queda logueada).
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\instalar-bridge-usuario.ps1
  ```
  Desinstalar: `Unregister-ScheduledTask -TaskName "CDP Tango Bridge (usuario)" -Confirm:$false`

**Cloudflare Tunnel como servicio** (requiere tunnel con nombre, paso de arriba):
```powershell
cloudflared service install   # lo deja como servicio de Windows, arranca solo
```
(La opción rápida `--url ...trycloudflare.com` NO es para 24/7: es temporal y la
URL cambia. Para producción usá el tunnel con nombre + dominio.)

## 3. En Vercel (Project → Settings → Environment Variables)

```
VENTAS_SOURCE=live
TANGO_BRIDGE_URL=https://tango.tudominio.com     # la URL del túnel
TANGO_BRIDGE_SECRET=<el mismo BRIDGE_SECRET>
```
Dejar `DATA_SOURCE=mock` (pedidos/catálogo siguen mock hasta tener Raven token / vista catálogo).
**Redeploy** para que tome las variables.

## Notas
- El bridge solo expone `GET /ventas?desde&hasta` (consulta parametrizada a la vista,
  sin SQL arbitrario) y exige el header `x-bridge-secret`. No expone el SQL.
- En la red interna, el dev local usa **SQL directo** (sin bridge): no setees
  `TANGO_BRIDGE_URL` en esa `.env.local`.
- Mismo patrón sirve a futuro para Catálogo: se agrega un `GET /catalogo` al bridge.
