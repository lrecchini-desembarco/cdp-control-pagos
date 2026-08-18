import { readStore } from "./store";

// URL vigente del servidor de IPs libres. Igual que lib/bridge-url.ts (Tango): la
// publica el watchdog de esa máquina en el KV ("ip-libres-url") cada vez que
// levanta un túnel nuevo (ver /api/ip-libres-url), así el dashboard nunca necesita
// que toques Vercel. Si el KV está vacío, cae a la env IP_LIBRES_URL (útil si el
// servidor tiene una URL fija en la LAN, sin túnel).
export async function getIpLibresUrl(): Promise<string | null> {
  try {
    const dato = await readStore<{ url?: string } | null>("ip-libres-url", null);
    if (dato?.url) return dato.url.replace(/\/+$/, "");
  } catch {}
  const env = process.env.IP_LIBRES_URL;
  return env ? env.replace(/\/+$/, "") : null;
}
