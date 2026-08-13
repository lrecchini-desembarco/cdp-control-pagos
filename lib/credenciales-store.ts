import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { readStore, writeStore } from "./store";
import type { CredencialPublica } from "./credenciales";

// Bóveda de credenciales (server-only).
//
// La contraseña NUNCA se guarda en claro: se cifra con AES-256-GCM usando la clave
// de entorno CREDENCIALES_KEY. Si alguien lee el KV, un backup o el .data/ local,
// sin esa clave no obtiene nada. La clave no vive en el repo ni en el store: solo
// en las variables de entorno (Vercel / .env.local).
//
// Guardar sin clave configurada es un error explícito, no un fallback a texto plano.

interface Credencial extends CredencialPublica {
  /** AES-256-GCM: iv:tag:ciphertext, todo en base64. */
  secreto: string;
}

const KEY = "credenciales";

/** Clave de 32 bytes derivada de CREDENCIALES_KEY. Sin la env, no se puede operar. */
function clave(): Buffer {
  const raw = process.env.CREDENCIALES_KEY?.trim();
  if (!raw) {
    throw new Error(
      "Falta CREDENCIALES_KEY: sin esa clave no se pueden guardar ni leer contraseñas. Ver docs/credenciales.md."
    );
  }
  // sha256 del secreto: acepta cualquier largo de env y siempre da los 32 bytes.
  return createHash("sha256").update(raw).digest();
}

export const cifradoConfigurado = () => Boolean(process.env.CREDENCIALES_KEY?.trim());

function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), datos.toString("base64")].join(":");
}

function descifrar(guardado: string): string {
  const [iv, tag, datos] = guardado.split(":");
  if (!iv || !tag || !datos) throw new Error("La credencial guardada está corrupta.");
  const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64")), d.final()]).toString("utf8");
}

const nuevoId = () => Date.now().toString(36) + randomBytes(4).toString("hex");

const todas = async (): Promise<Credencial[]> => (await readStore<Credencial[] | null>(KEY, null)) ?? [];

const sinSecreto = ({ secreto, ...resto }: Credencial): CredencialPublica => resto;

/** Lista para la UI: metadata sí, contraseñas no. */
export async function getCredenciales(): Promise<CredencialPublica[]> {
  return (await todas())
    .map(sinSecreto)
    .sort((a, b) => a.sistema.localeCompare(b.sistema, "es") || a.usuario.localeCompare(b.usuario, "es"));
}

/** La contraseña en claro de UNA credencial. Se pide de a una, cuando se aprieta "Ver". */
export async function revelar(id: string): Promise<string> {
  const c = (await todas()).find((x) => x.id === id);
  if (!c) throw new Error("No existe esa credencial.");
  return descifrar(c.secreto);
}

/** Alta (sin id) o edición (con id). La contraseña solo se toca si viene en el body. */
export async function upsertCredencial(
  input: Partial<CredencialPublica> & { id?: string; secreto?: string },
  email: string
): Promise<CredencialPublica[]> {
  const lista = await todas();
  const ahora = new Date().toISOString();

  if (input.id) {
    const i = lista.findIndex((x) => x.id === input.id);
    if (i < 0) throw new Error("No existe esa credencial.");
    lista[i] = {
      ...lista[i],
      ...(input.sistema !== undefined ? { sistema: String(input.sistema).trim() } : {}),
      ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
      ...(input.usuario !== undefined ? { usuario: String(input.usuario).trim() } : {}),
      ...(input.url !== undefined ? { url: String(input.url).trim() } : {}),
      ...(input.nota !== undefined ? { nota: String(input.nota) } : {}),
      ...(input.secreto ? { secreto: cifrar(String(input.secreto)) } : {}),
      actualizado: ahora,
      actualizadoPor: email,
    };
  } else {
    const sistema = String(input.sistema ?? "").trim();
    if (!sistema) throw new Error("Poné a qué sistema pertenece.");
    if (!input.secreto) throw new Error("Falta la contraseña.");
    lista.push({
      id: nuevoId(),
      sistema,
      categoria: input.categoria || "Otros",
      usuario: String(input.usuario ?? "").trim(),
      url: String(input.url ?? "").trim(),
      nota: String(input.nota ?? ""),
      secreto: cifrar(String(input.secreto)),
      actualizado: ahora,
      actualizadoPor: email,
    });
  }

  await writeStore(KEY, lista);
  return getCredenciales();
}

export async function removeCredencial(id: string): Promise<CredencialPublica[]> {
  await writeStore(KEY, (await todas()).filter((x) => x.id !== id));
  return getCredenciales();
}
