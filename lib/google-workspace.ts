// Admin SDK de Google Workspace (Directory + Drive), server-only.
// Auth: service account con domain-wide delegation, impersonando a un admin
// del dominio (GOOGLE_WORKSPACE_ADMIN_EMAIL) — es el único modo de leer/escribir
// datos de TODOS los usuarios sin que cada uno haga su propio consentimiento.
// No se usa la lib "googleapis" (mismo criterio que google-auth.ts): JWT RS256
// firmado a mano + fetch directo a las REST API, para no sumar una dependencia
// pesada por un puñado de endpoints.
import { createSign } from "crypto";
import { DOMINIO } from "./google-auth";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DIRECTORY_BASE = "https://admin.googleapis.com/admin/directory/v1";
const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

const SCOPES = {
  userRW: "https://www.googleapis.com/auth/admin.directory.user",
  groupRO: "https://www.googleapis.com/auth/admin.directory.group.readonly",
  driveRO: "https://www.googleapis.com/auth/drive.readonly",
};

function saEmail() {
  return process.env.GOOGLE_WORKSPACE_SA_EMAIL ?? "";
}
function saPrivateKey() {
  // En .env la clave viene con \n escapados (no admite saltos de línea reales).
  return (process.env.GOOGLE_WORKSPACE_SA_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}
function adminImpersonar() {
  return process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL ?? "";
}

/** ¿Están las tres variables de entorno cargadas? (si no, la pantalla avisa.) */
export function workspaceConfigurado(): boolean {
  return Boolean(saEmail() && saPrivateKey() && adminImpersonar());
}

function base64url(input: Buffer | string): string {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Firma un JWT de service account (RS256) para pedir un access_token de las scopes dadas. */
function firmarJwtServiceAccount(scopes: string[]): string {
  const ahora = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: saEmail(),
    sub: adminImpersonar(), // domain-wide delegation: actúa "como" este admin
    scope: scopes.join(" "),
    aud: TOKEN_URL,
    iat: ahora,
    exp: ahora + 3600,
  };
  const partes = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const firma = createSign("RSA-SHA256").update(partes).sign(saPrivateKey());
  return `${partes}.${base64url(firma)}`;
}

async function obtenerAccessToken(scopes: string[]): Promise<string> {
  const assertion = firmarJwtServiceAccount(scopes);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`Google token ${r.status}: ${await r.text().catch(() => "")}`);
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("Google no devolvió access_token.");
  return j.access_token;
}

async function llamar<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json() as Promise<T>;
}

export interface WorkspaceUsuario {
  email: string;
  nombre: string;
  ou: string;
  suspendido: boolean;
  fotoUrl?: string;
}

/** Lista todos los usuarios del dominio (paginado). */
export async function listarUsuariosWorkspace(): Promise<WorkspaceUsuario[]> {
  const token = await obtenerAccessToken([SCOPES.userRW]);
  const usuarios: WorkspaceUsuario[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ domain: DOMINIO, maxResults: "200", orderBy: "email" });
    if (pageToken) p.set("pageToken", pageToken);
    const j = await llamar<{ users?: any[]; nextPageToken?: string }>(`${DIRECTORY_BASE}/users?${p}`, token);
    for (const u of j.users ?? []) {
      usuarios.push({
        email: u.primaryEmail,
        nombre: u.name?.fullName ?? u.primaryEmail,
        ou: u.orgUnitPath ?? "/",
        suspendido: Boolean(u.suspended),
        fotoUrl: u.thumbnailPhotoUrl,
      });
    }
    pageToken = j.nextPageToken;
  } while (pageToken);
  return usuarios;
}

export interface WorkspaceDetalle {
  isAdmin: boolean;
  isDelegatedAdmin: boolean;
  is2svEnrolled: boolean;
  lastLoginTime?: string;
  grupos: string[];
  unidadesCompartidas: { nombre: string; rol: string }[];
}

/** Detalle de un usuario puntual: rol admin, 2FA, grupos y a qué shared drives tiene acceso. */
export async function detalleUsuarioWorkspace(email: string): Promise<WorkspaceDetalle> {
  const tokenUser = await obtenerAccessToken([SCOPES.userRW]);
  const u = await llamar<any>(`${DIRECTORY_BASE}/users/${encodeURIComponent(email)}`, tokenUser);

  const tokenGroups = await obtenerAccessToken([SCOPES.groupRO]);
  const grupos: string[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ userKey: email, domain: DOMINIO, maxResults: "200" });
    if (pageToken) p.set("pageToken", pageToken);
    const jg = await llamar<{ groups?: any[]; nextPageToken?: string }>(`${DIRECTORY_BASE}/groups?${p}`, tokenGroups);
    for (const g of jg.groups ?? []) grupos.push(g.email);
    pageToken = jg.nextPageToken;
  } while (pageToken);

  const unidadesCompartidas = await unidadesCompartidasDe(email);

  return {
    isAdmin: Boolean(u.isAdmin),
    isDelegatedAdmin: Boolean(u.isDelegatedAdmin),
    is2svEnrolled: Boolean(u.isEnrolledIn2Sv),
    lastLoginTime: u.lastLoginTime,
    grupos,
    unidadesCompartidas,
  };
}

/**
 * Shared Drives a los que un usuario tiene acceso. No hay endpoint directo
 * "shared drives de este usuario": se listan TODOS los shared drives del
 * dominio (con permiso de admin) y por cada uno se revisa si el email
 * aparece en sus permisos. Costoso si hay muchos drives, pero se pide
 * on-demand (al abrir la card), no al listar usuarios.
 */
async function unidadesCompartidasDe(email: string): Promise<{ nombre: string; rol: string }[]> {
  const token = await obtenerAccessToken([SCOPES.driveRO]);
  const drives: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ useDomainAdminAccess: "true", pageSize: "100" });
    if (pageToken) p.set("pageToken", pageToken);
    const j = await llamar<{ drives?: any[]; nextPageToken?: string }>(`${DRIVE_BASE}/drives?${p}`, token);
    for (const d of j.drives ?? []) drives.push({ id: d.id, name: d.name });
    pageToken = j.nextPageToken;
  } while (pageToken);

  const resultado: { nombre: string; rol: string }[] = [];
  for (const d of drives) {
    try {
      const p = new URLSearchParams({ useDomainAdminAccess: "true", fields: "permissions(emailAddress,role)" });
      const j = await llamar<{ permissions?: any[] }>(`${DRIVE_BASE}/drives/${d.id}/permissions?${p}`, token);
      const perm = (j.permissions ?? []).find((x) => (x.emailAddress ?? "").toLowerCase() === email.toLowerCase());
      if (perm) resultado.push({ nombre: d.name, rol: perm.role });
    } catch {
      // Un drive individual puede fallar (borrado, sin permiso puntual); se ignora y se sigue.
    }
  }
  return resultado;
}

export interface ResultadoFoto {
  email: string;
  ok: boolean;
  error?: string;
}

/** Aplica la misma foto (bytes crudos del archivo) a una lista de usuarios. */
export async function subirFotoMasiva(emails: string[], fotoBytes: Buffer): Promise<ResultadoFoto[]> {
  const token = await obtenerAccessToken([SCOPES.userRW]);
  const photoData = base64url(fotoBytes); // la API pide base64 "web safe" (= base64url)
  const resultados: ResultadoFoto[] = [];
  for (const email of emails) {
    try {
      const r = await fetch(`${DIRECTORY_BASE}/users/${encodeURIComponent(email)}/photos/thumbnail`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ photoData }),
      });
      if (!r.ok) throw new Error(await r.text().catch(() => `HTTP ${r.status}`));
      resultados.push({ email, ok: true });
    } catch (err) {
      resultados.push({ email, ok: false, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  }
  return resultados;
}
