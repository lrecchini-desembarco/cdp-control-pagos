import { readStore, writeStore } from "./store";

// Config del sistema de reseñas. Por ahora una sola perilla: si el CUPÓN 15% OFF
// está activo. Con false (default): el cliente entra, deja datos, califica en Google
// y ve "¡Gracias por calificar!" (sin cupón), y el QR no muestra la miniatura de 15%.
// Con true: vuelve todo el recorrido del cupón + la miniatura en el póster.
// Se maneja desde la pantalla Reseñas (admin/operaciones).

const KEY = "resenas_config";

export interface ResenasConfig {
  cuponActivo: boolean;
}

export async function getResenasConfig(): Promise<ResenasConfig> {
  const c = await readStore<ResenasConfig | null>(KEY, null);
  return { cuponActivo: c?.cuponActivo ?? false };
}

export async function setCuponActivo(on: boolean): Promise<ResenasConfig> {
  const cfg = { cuponActivo: Boolean(on) };
  await writeStore(KEY, cfg);
  return cfg;
}
