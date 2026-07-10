// Login con Google (OAuth 2.0, authorization code flow). Server-only.
// El intercambio del code por tokens se hace server-to-server con el client secret,
// así que el id_token que devuelve Google es confiable sin re-verificar la firma.
// Se restringe al dominio de Workspace (rechaza cualquier otro mail).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const DOMINIO = (process.env.GOOGLE_ALLOWED_DOMAIN ?? "eldesembarco.com").toLowerCase();

const clientId = () => process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET ?? "";

/** ¿Están las credenciales cargadas? (si no, el botón de Google avisa). */
export const googleConfigurado = () => Boolean(clientId() && clientSecret());

/** El redirect debe estar registrado EXACTO en la consola de Google. */
export const redirectUri = (origin: string) => `${origin}/api/auth/google/callback`;

/** ¿El email es del dominio permitido? (chequeo en código, además del consent "Interno"). */
export function dominioPermitido(email?: string, hd?: string): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const okEmail = e.endsWith("@" + DOMINIO);
  const okHd = !hd || hd.toLowerCase() === DOMINIO;
  return okEmail && okHd;
}

/** URL a la que mandamos al usuario para que elija su cuenta de Google. */
export function authUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    hd: DOMINIO,                 // sugiere el dominio del Workspace
    prompt: "select_account",
    access_type: "online",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

function decodeJwtPayload(idToken: string): Record<string, any> {
  const part = idToken.split(".")[1] ?? "";
  const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json);
}

export interface GoogleUser {
  email: string;
  emailVerified: boolean;
  hd?: string;
  nombre?: string;
}

/** Intercambia el code por tokens y devuelve los datos del usuario del id_token. */
export async function intercambiarCodigo(origin: string, code: string): Promise<GoogleUser> {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`Google token ${r.status}: ${await r.text().catch(() => "")}`);
  const tok = (await r.json()) as { id_token?: string };
  if (!tok.id_token) throw new Error("Google no devolvió id_token.");
  const c = decodeJwtPayload(tok.id_token);
  return {
    email: String(c.email ?? "").toLowerCase(),
    emailVerified: Boolean(c.email_verified),
    hd: c.hd ? String(c.hd) : undefined,
    nombre: c.name ? String(c.name) : undefined,
  };
}
