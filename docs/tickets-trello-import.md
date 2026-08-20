# Tickets → "Sincronizar con Trello"

Botón en **Panel de Sistemas → Tickets** que trae las cards del tablero de
Trello y crea un ticket por cada una que todavía no exista en el dashboard.
Es de lectura only: nunca escribe nada en Trello, solo lee el tablero.

Es un complemento del webhook de n8n (`docs/tickets-webhook.md`), no lo
reemplaza — sirve para las cards que se crearon a mano en Trello (o por
cualquier otra vía) y nunca pasaron por ese flujo.

## Cómo importa

- Trae **solo las cards abiertas** (no archivadas) del tablero.
- Cada card entra como ticket **abierto**, categoría **"Otro"**, prioridad
  **media** — sistemas la categoriza/prioriza a mano, como cualquier ticket
  nuevo.
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
  lectura).
- `lib/tickets-store.ts` `importarDesdeTrello()` — dedup y alta de tickets.
- `app/api/tickets/importar-trello/route.ts` — el endpoint del botón (gate:
  acceso al Panel de Sistemas).
- `components/views/TicketsView.tsx` — botón "Sincronizar con Trello" y el
  chip "Trello" en la fila de tickets que vinieron de ahí.

## Categorías editables

De paso, las categorías de tickets (`Hardware`, `Software`, ...) dejaron de
ser una lista fija en el código: son editables desde la misma pantalla
(Panel de Sistemas → Tickets → tarjeta "Categorías"), persistidas igual que
el resto de la configuración de la app. `lib/tickets.ts` sigue teniendo
`CATEGORIAS_TICKET` como semilla inicial para cuando todavía no se guardó
nada. `GET /api/tickets/categorias` lo puede leer cualquier cuenta logueada
(lo necesita el formulario de `/tickets`); `POST` (agregar/quitar) es solo
para quien tiene acceso al Panel de Sistemas.
