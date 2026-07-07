import { readStore } from "./store";

// URL vigente del bridge de Tango. La publica el watchdog de la máquina en el KV
// ("bridge-url") cada vez que levanta un túnel nuevo (ver /api/bridge-url), así el
// dashboard nunca necesita que toques Vercel. Si el KV está vacío, cae a la env.
export async function getBridgeUrl(): Promise<string | null> {
  try {
    const dato = await readStore<{ url?: string } | null>("bridge-url", null);
    if (dato?.url) return dato.url.replace(/\/+$/, "");
  } catch {}
  const env = process.env.TANGO_BRIDGE_URL;
  return env ? env.replace(/\/+$/, "") : null;
}
