import { Pool } from "pg";

// Pool singleton read-only a la base Postgres (Neon) del grupo — la misma de
// Cierres/bi-ventas. La usa SOLO la pantalla /compras (Consumo CMV vs Ventas)
// para leer datos reales de Tango ya consolidados. Cache-por-módulo para no
// abrir un pool nuevo en cada request serverless.
let pool: Pool | null = null;

export function getConsumoPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta DATABASE_URL (Postgres del grupo). Configurala en .env.local / Vercel para ver Consumo vs Ventas."
    );
  }
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Neon requiere TLS; cert gestionado por el proveedor
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await getConsumoPool().query(text, params);
  return res.rows as T[];
}
