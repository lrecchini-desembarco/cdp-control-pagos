import { readStore, writeStore } from "./store";
import { esRol } from "./roles";
import { hashPassword } from "./auth-hash";
import type { Rol } from "./roles";

export interface Usuario {
  email: string;
  rol: Rol;
  pass?: string;   // hash de su clave propia; si falta, usa la clave genérica
  nav?: string[];  // pantallas que ve ESTE usuario (pisa el nav del rol). Si falta, usa el del rol.
}

// Usuarios sembrados (sirven de ejemplo y garantizan que siempre haya un admin).
const SEED: Usuario[] = [
  { email: "lrecchini@eldesembarco.com", rol: "admin" },
  { email: "polejavetzky@eldesembarco.com", rol: "admin" },
  { email: "operaciones@eldesembarco.com", rol: "operaciones" },
  { email: "encargado.flores@eldesembarco.com", rol: "local" },
];

const norm = (e: string) => e.trim().toLowerCase();

export async function getUsuarios(): Promise<Usuario[]> {
  const saved = await readStore<Usuario[] | null>("usuarios", null);
  const base = Array.isArray(saved) && saved.length ? saved : SEED;
  // Garantía: siempre tiene que existir al menos un admin.
  return base.some((u) => u.rol === "admin") ? base : [...base, SEED[0]];
}

export async function findUsuario(email: string): Promise<Usuario | undefined> {
  const e = norm(email);
  return (await getUsuarios()).find((u) => norm(u.email) === e);
}

export async function addUsuario(email: string, rol: Rol, password?: string, nav?: string[]): Promise<Usuario[]> {
  if (!email.includes("@") || !esRol(rol)) throw new Error("Email o rol inválido.");
  const e = norm(email);
  const actuales = await getUsuarios();
  const previo = actuales.find((u) => norm(u.email) === e);
  const users = actuales.filter((u) => norm(u.email) !== e);
  // Clave nueva si la mandan; si no, conserva la que tenía (al editar el rol).
  const pass = password ? hashPassword(password) : previo?.pass;
  // nav propio: si mandan un array lo usa (aunque sea vacío = solo lo fijo); si es
  // undefined, conserva el que tenía. Los admin ven todo igual (blindar lo maneja).
  const navPropio = nav !== undefined ? nav : previo?.nav;
  users.push({ email: norm(email), rol, ...(pass ? { pass } : {}), ...(navPropio ? { nav: navPropio } : {}) });
  await writeStore("usuarios", users);
  return users;
}

/**
 * Devuelve el usuario; si no existe lo crea con rol "pendiente" (sin acceso).
 * Lo usa el login con Google: cualquier @dominio entra, pero arranca sin accesos
 * hasta que el admin le asigne un rol. Los ya cargados conservan su rol.
 */
export async function ensureUsuario(email: string): Promise<Usuario> {
  const previo = await findUsuario(email);
  if (previo) return previo;
  const nuevo: Usuario = { email: norm(email), rol: "pendiente" };
  const users = [...(await getUsuarios()), nuevo];
  await writeStore("usuarios", users);
  return nuevo;
}

export async function removeUsuario(email: string): Promise<Usuario[]> {
  const e = norm(email);
  const users = (await getUsuarios()).filter((u) => norm(u.email) !== e);
  if (!users.some((u) => u.rol === "admin")) {
    throw new Error("No se puede quedar sin ningún administrador.");
  }
  await writeStore("usuarios", users);
  return users;
}
