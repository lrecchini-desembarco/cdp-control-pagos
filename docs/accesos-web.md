# Accesos del ecosistema web

Pestaña **Ecosistema web** dentro de *Panel de Sistemas → Credenciales*
(`/panel-sistemas/credenciales`). Centraliza URLs, pantallas internas y secretos de
servicio de **desembarco-web**, para no tener que buscarlos en chats ni archivos sueltos.

## ⚠️ El repo es PÚBLICO

En el código **solo vive la estructura**: qué accesos existen, para qué sirven, dónde se
usan y **el nombre** de la variable que guarda el valor. Ningún secreto se escribe en el
repo — ni en `.ts`, ni en `.json`, ni en un comentario, ni en `.env.example`.

El valor sale de una **variable de entorno de Vercel marcada como Sensitive**, que lee el
servidor recién cuando alguien aprieta *Mostrar*. Si la variable no está cargada, la fila
dice **"no cargado"** (nunca un placeholder que parezca real).

## Quién entra

Doble candado, los dos resueltos **en el servidor**:

1. `lib/panel-sistemas.ts` → acceso al Panel de Sistemas.
2. `lib/credenciales.ts` (`EMAILS_CREDENCIALES`) → lista blanca por **email**, más
   estricta: un admin que no esté en la lista tampoco entra.

La API (`/api/accesos`) revalida las dos cosas en cada request: el filtrado no es
cosmético, los valores ni siquiera se serializan si el usuario no corresponde.

## Cómo se comporta

- Los valores llegan **ocultos**. Se piden **de a uno**, con *Mostrar*.
- Lo revelado vive solo en el estado del componente: **al salir de la pantalla se descarta**.
- *Copiar* manda el valor al portapapeles **sin mostrarlo**.
- Cada *Mostrar* y cada *Copiar* queda en la **bitácora** (pestaña *Bitácora*): quién, qué y
  cuándo. La bitácora **no guarda valores**, solo el nombre de lo que se pidió.

## Cargar un acceso que figura "no cargado"

En el proyecto **cdp-control-pagos** de Vercel → *Settings → Environment Variables* →
agregar la variable con el nombre que muestra el catálogo (`lib/accesos.ts`), marcada como
**Sensitive**, en Production y Preview. Después de redeployar, la fila pasa a *Mostrar / Copiar*.

Un acceso puede declarar **varios nombres candidatos** (`envs`): gana el primero que exista.
Sirve cuando la misma cosa se llama distinto en cada proyecto (ej. `DASHBOARD_STORE_SECRETO`
en la web y `DASH_STORE_SECRETO` en el dashboard).

## Estructura

| Archivo | Qué hace |
|---|---|
| `lib/accesos.ts` | Catálogo (grupos e ítems). **Solo estructura**, sin valores. Config pura. |
| `lib/accesos-server.ts` | Resuelve los valores desde `process.env`. **Server-only.** |
| `lib/auditoria-store.ts` | Bitácora append-only (últimos 500 eventos). |
| `app/api/accesos/route.ts` | Lista sin valores · revela de a uno · registra · bitácora. |
| `components/views/AccesosWebView.tsx` | La pantalla. |
| `components/views/CredencialesShell.tsx` | Las 3 pestañas (Bóveda · Ecosistema web · Bitácora). |

## Regla operativa

> Los commits del repo `desembarco-web` deben ir con la identidad
> **Luciano `<lrecchini@eldesembarco.com>`**. El plan de Vercel es Hobby con repo privado:
> los deploys de commits con otro autor quedan **bloqueados**.

Está a la vista en la pantalla (`REGLA_COMMITS` en `lib/accesos.ts`), no enterrada acá.
