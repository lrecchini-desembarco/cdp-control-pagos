// Lectura del tablero de Trello (server-only). Solo lectura: trae las cards
// abiertas del tablero para importarlas como tickets — no escribe nada en
// Trello. Auth simple de la API pública de Trello (API key + token), no hace
// falta un service account ni OAuth.

const API_BASE = "https://api.trello.com/1";

const apiKey = () => process.env.TRELLO_API_KEY ?? "";
const token = () => process.env.TRELLO_TOKEN ?? "";
// Admite tanto el ID largo como el "shortLink" del tablero (ej. de
// https://trello.com/b/CV7Shf3A/... el shortLink es "CV7Shf3A") — la API de
// Trello acepta los dos formatos en este endpoint.
const boardId = () => process.env.TRELLO_BOARD_ID ?? "";

/** ¿Están las tres variables de entorno cargadas? (si no, el botón avisa en vez de romper.) */
export const trelloConfigurado = (): boolean => Boolean(apiKey() && token() && boardId());

export interface TrelloCard {
  id: string;
  shortLink: string;
  name: string;
  desc: string;
  shortUrl: string;
}

/** Cards abiertas (no archivadas) del tablero configurado. */
export async function listarCardsTablero(): Promise<TrelloCard[]> {
  const p = new URLSearchParams({
    key: apiKey(),
    token: token(),
    fields: "name,desc,shortLink,shortUrl",
    filter: "open",
  });
  const r = await fetch(`${API_BASE}/boards/${boardId()}/cards?${p}`);
  if (!r.ok) throw new Error(`Trello ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json();
}
