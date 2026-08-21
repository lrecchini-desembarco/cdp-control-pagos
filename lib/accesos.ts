// Accesos del ecosistema de la web nueva (desembarco-web): QUÉ existe, para qué
// sirve y dónde se usa. Config pura, usable en cliente.
//
// ⚠️ ESTE REPO ES PÚBLICO. Acá NO va ninguna contraseña, token ni secreto: solo la
// ESTRUCTURA. El valor de cada acceso vive en una variable de entorno del proyecto
// en Vercel (marcada como Sensitive) y lo lee el SERVIDOR al momento de revelarlo
// (ver lib/accesos-server.ts + app/api/accesos). Si la env no está cargada, la fila
// se muestra como "no cargado" — nunca con un placeholder que parezca real.

export type TipoAcceso = "url" | "secreto" | "dato";

export interface Acceso {
  id: string;
  nombre: string;
  para: string;              // para qué sirve
  donde?: string;            // dónde se usa (pantalla, sistema, flujo)
  tipo: TipoAcceso;
  url?: string;              // solo tipo "url"
  acceso?: string;           // cómo se entra (público, login GitHub, clave propia…)
  /**
   * Nombres de env candidatos que pueden tener el valor, en orden de preferencia.
   * Solo el nombre: el valor jamás se escribe acá. La primera que exista, gana.
   */
  envs?: string[];
  formato?: string;          // cómo viene el valor (ej. "Nombre:clave,Otro:clave2")
  valor?: string;            // solo tipo "dato": info NO secreta (host, puerto, base…)
}

export interface GrupoAccesos {
  id: string;
  titulo: string;
  desc?: string;
  items: Acceso[];
}

const REPO_WEB = "https://github.com/lrecchini-desembarco/desembarco-web";

export const GRUPOS_ACCESOS: GrupoAccesos[] = [
  {
    id: "ambientes",
    titulo: "Ambientes de la web nueva",
    desc: "Dónde vive cada cosa del sitio desembarco-web.",
    items: [
      { id: "web-prod", nombre: "Producción", para: "El sitio público en vivo.", tipo: "url", url: "https://desembarco-web.vercel.app", acceso: "Público" },
      { id: "web-dev", nombre: "Develop", para: "Ambiente de prueba antes de publicar.", tipo: "url", url: "https://desembarco-web-develop.vercel.app", acceso: "Público" },
      { id: "web-repo", nombre: "Repositorio (privado)", para: "El código del sitio.", tipo: "url", url: REPO_WEB, acceso: "Login GitHub" },
      { id: "web-vercel", nombre: "Panel de Vercel", para: "Deploys, dominios y variables de entorno del sitio.", tipo: "url", url: "https://vercel.com/lrecchini-5428s-projects/desembarco-web", acceso: "Login Vercel" },
      { id: "web-ci-dev", nombre: "Carga de precios (CI · develop)", para: "Corre el circuito de precios contra develop.", donde: "GitHub Actions", tipo: "url", url: `${REPO_WEB}/actions/workflows/precios-develop.yml`, acceso: "Login GitHub" },
      { id: "web-ci-prod", nombre: "Promover a producción (CI)", para: "Publica los precios ya validados.", donde: "GitHub Actions", tipo: "url", url: `${REPO_WEB}/actions/workflows/precios-prod.yml`, acceso: "Login GitHub" },
      { id: "web-tunel", nombre: "Admin de precios (túnel)", para: "Endpoint que usa la web para pedirle precios a este dashboard.", donde: "CDP · Control", tipo: "url", url: "https://cdp-control-pagos.vercel.app/api/admin-web", acceso: "Clave propia (ver Túnel admin)" },
    ],
  },
  {
    id: "pantallas",
    titulo: "Pantallas internas de la web",
    desc: "Claves por persona o por local para entrar a las pantallas privadas del sitio.",
    items: [
      { id: "web-dashboard", nombre: "Dashboard", para: "Tablero interno de la web.", donde: "/dashboard", tipo: "secreto", envs: ["DASHBOARD_CLAVES"], formato: "Nombre:clave,Otro:clave2" },
      { id: "web-comandera", nombre: "Comandera", para: "Pantalla de comandas por local.", donde: "/comandera", tipo: "secreto", envs: ["CLAVES_COMANDERA"], formato: "Local:clave,TODAS:clave" },
      { id: "web-admin-precios", nombre: "Admin de precios", para: "Carga y revisión de precios del sitio.", donde: "/admin/precios", tipo: "secreto", envs: ["PRECIOS_ADMIN_CLAVE"] },
    ],
  },
  {
    id: "servicio",
    titulo: "Secretos de servicio de la web",
    desc: "Tokens que usan los procesos automáticos. No se comparten con nadie fuera de Sistemas.",
    items: [
      { id: "vercel-token", nombre: "VERCEL_TOKEN", para: "Deploys y alias desde CI (scope del team).", donde: "GitHub Actions", tipo: "secreto", envs: ["VERCEL_TOKEN"] },
      { id: "dashboard-secreto", nombre: "DASHBOARD_SECRETO", para: "Firma la sesión del dashboard de la web.", donde: "desembarco-web", tipo: "secreto", envs: ["DASHBOARD_SECRETO"] },
      { id: "dashboard-store", nombre: "DASHBOARD_STORE_SECRETO", para: "Autoriza la lectura/escritura del store del dashboard.", donde: "desembarco-web ↔ CDP", tipo: "secreto", envs: ["DASHBOARD_STORE_SECRETO", "DASH_STORE_SECRETO"] },
      { id: "tunel-admin", nombre: "TUNEL_ADMIN_SECRETO", para: "Autentica el túnel de precios contra este dashboard.", donde: "CDP · /api/admin-web", tipo: "secreto", envs: ["TUNEL_ADMIN_SECRETO"] },
      { id: "blob-token", nombre: "BLOB_READ_WRITE_TOKEN", para: "Sube y lee archivos del Blob de la web (imágenes, PDFs).", donde: "desembarco-web", tipo: "secreto", envs: ["BLOB_READ_WRITE_TOKEN"] },
      { id: "resto-token", nombre: "RESTO_API_TOKEN", para: "Consulta la API del sistema del restaurante.", donde: "desembarco-web", tipo: "secreto", envs: ["RESTO_API_TOKEN"] },
    ],
  },
  {
    id: "tango",
    titulo: "Tango · SQL de solo lectura (por LAN)",
    desc: "Solo se llega desde la red interna. Los usuarios son de lectura: no pueden escribir en Tango.",
    items: [
      { id: "tango-host", nombre: "Servidor", para: "Dónde está la base de Tango.", tipo: "dato", valor: "SRVTANGO · 192.168.15.5 · puerto 1433" },
      { id: "tango-base", nombre: "Base de datos", para: "Base consolidada que se consulta.", tipo: "dato", valor: "CENTRAL_ESTADISTICA" },
      { id: "tango-vista-precios", nombre: "Vista de precios", para: "De acá salen los precios que publica la web.", tipo: "dato", valor: "vw_PreciosProducto" },
      { id: "tango-bridge-lectura", nombre: "Usuario bridge_lectura", para: "Lo usan el bridge de Tango y el BI.", donde: "Bridge / bi-ventas", tipo: "secreto", envs: ["TANGO_DB_PASSWORD", "BRIDGE_SECRET"] },
      { id: "tango-cdp-lectura", nombre: "Usuario cdp_lectura", para: "Lo usa el circuito de precios de la web.", donde: "desembarco-web", tipo: "secreto", envs: ["TANGO_CDP_LECTURA_PASSWORD"] },
    ],
  },
];

/** Regla operativa que tiene que quedar a la vista en la pantalla. */
export const REGLA_COMMITS =
  "Los commits del repo desembarco-web deben ir con la identidad Luciano <lrecchini@eldesembarco.com>. El plan de Vercel es Hobby con repo privado: los deploys de commits con otro autor quedan BLOQUEADOS.";

/** Lo que viaja al cliente: todo menos el valor de los secretos. */
export interface AccesoPublico extends Omit<Acceso, "envs"> {
  /** true = hay una env cargada con el valor; false = "no cargado". */
  disponible?: boolean;
}
