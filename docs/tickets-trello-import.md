# Tickets → "Sincronizar con Trello"

Botón en **Panel de Sistemas → Tickets** que trae las cards del tablero de
Trello y crea un ticket por cada una que todavía no exista en el dashboard.
Es de lectura only: nunca escribe nada en Trello, solo lee el tablero.

Es un complemento del webhook de n8n (`docs/tickets-webhook.md`), no lo
reemplaza — sirve para las cards que se crearon a mano en Trello (o por
cualquier otra vía) y nunca pasaron por ese flujo.

## Cómo importa

- Trae **solo las cards abiertas** (no archivadas) del tablero, junto con la
  columna (lista) donde está cada una.
- La columna define categoría y, en algunos casos, estado — ver
  `TRELLO_LISTA_CATEGORIA` / `TRELLO_LISTA_ESTADO` en `lib/tickets.ts` (por
  ejemplo "Qlik" y "En poder de Qlik" → categoría `Qlik`; "Resuelto" → estado
  `resuelto`). Si la columna no tiene mapeo, entra como categoría **"Otro"**,
  estado **abierto**. Prioridad siempre entra **media** — eso sí lo pone
  sistemas a mano.
- `solicitante` queda como `"Trello"` (no hay un email real detrás de una
  card creada en el tablero).
- No duplica: cada card tiene un `shortLink` único en Trello: si esa card ya
  se importó antes, o si ya existe un ticket con esa card enlazada por
  `trelloUrl` (los que crea el webhook de n8n), se salta.
- Es manual (un botón), no un cron automático — Vercel Hobby solo permite
  crons de una vez por día, insuficiente para esto. Apretalo cuando quieras
  traer lo nuevo del tablero.

## Variables de entorno (Vercel → proyecto → Settings → Environment Variables)

```
TRELLO_API_KEY  = tu api key personal
TRELLO_TOKEN    = tu token (con permiso de lectura sobre el tablero)
TRELLO_BOARD_ID = CV7Shf3A
```

Para generar la API key y el token:
1. [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → crear
   un Power-Up (o usar uno existente) → **API Key** — ahí está tu key.
2. En la misma página hay un link para generar un **token** con permisos de
   lectura (`read`) sobre tus tableros — lo autorizás con tu cuenta y te da
   el token.
3. `TRELLO_BOARD_ID` es el código que aparece en la URL del tablero
   (`https://trello.com/b/<ESTE CÓDIGO>/nombre-del-tablero`).

Sin estas tres variables, el botón muestra "Trello no está configurado
todavía" en vez de romper.

## Implementación
- `lib/trello.ts` — `listarCardsTablero()` (GET `/1/boards/{id}/cards`, solo
  lectura, con `list=true` para traer la columna) y `buscarCardPorId()` (GET
  `/1/cards/{id}`, una card puntual — no filtra por tablero, así que
  funciona aunque la card ya se haya movido a otro).
- `lib/tickets-store.ts` `importarDesdeTrello()` — dedup, alta de tickets y
  mapeo columna→categoría/estado.
- `app/api/tickets/importar-trello/route.ts` — el endpoint del botón (gate:
  acceso al Panel de Sistemas).
- `components/views/TicketsView.tsx` — botón "Sincronizar con Trello" y el
  chip "Trello" en la fila de tickets que vinieron de ahí.

## "Recategorizar desde Trello"

Segundo botón, al lado del anterior. Para los tickets que **ya** son de
Trello (no trae cards nuevas), vuelve a consultar en qué columna está cada
card **hoy** y actualiza categoría/estado según el mismo mapeo — pensado
para poner al día tickets que se importaron antes de que existiera el
mapeo (por eso quedaron en "Otro"/"abierto" aunque en Trello ya estén, por
ejemplo, resueltos).

- `lib/tickets-store.ts` `recategorizarDesdeTrello()` — usa
  `buscarCardPorId()` por cada ticket (no la lista del tablero), así
  alcanza también a las cards que se movieron a otro tablero (ej. "Pasar a
  Apps"). No pisa el estado de un ticket que sistemas ya cerró a mano
  (`estado: "cerrado"`) — esa es la última palabra de sistemas.
- Si una card ya no existe en Trello (se borró), se cuenta aparte
  (`sinCard`) y el ticket no se toca.
- `app/api/tickets/recategorizar-trello/route.ts` — el endpoint (mismo gate
  que el de sincronizar).
- Es manual, se corre cuando se necesite — no hay por qué dejarlo en un
  cron.

## Categorías editables

De paso, las categorías de tickets (`Hardware`, `Software`, ...) dejaron de
ser una lista fija en el código: son editables desde la misma pantalla
(Panel de Sistemas → Tickets → tarjeta "Categorías"), persistidas igual que
el resto de la configuración de la app. `lib/tickets.ts` sigue teniendo
`CATEGORIAS_TICKET` como semilla inicial para cuando todavía no se guardó
nada. `GET /api/tickets/categorias` lo puede leer cualquier cuenta logueada
(lo necesita el formulario de `/tickets`); `POST` (agregar/quitar) es solo
para quien tiene acceso al Panel de Sistemas.
