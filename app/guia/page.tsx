import Link from "next/link";
import { Card } from "@/components/ui/primitives";

export const metadata = { title: "Guía · CDP Control" };

type Capacidad = {
  titulo: string;
  paraQue: string;
  pasos: string[];
  href: string;
  cta: string;
};

const CAPACIDADES: Capacidad[] = [
  {
    titulo: "CDP vs Ventas por local",
    paraQue: "Ver, local por local, lo que pidió al CDP contra lo que vendió. Detecta quién pidió sin vender ($ en riesgo) o vende sin pedir. Es la comparación más confiable (unidades reales, sin depender de la receta).",
    pasos: [
      "Entrá a CDP vs Ventas (local).",
      "Elegí el rango con Desde/Hasta.",
      "Filtrá por Tipo (propio/franquicia) o Riesgo, u ordená por mayor pedido/venta.",
      "Tocá una fila para el detalle por insumo de ese local.",
    ],
    href: "/pedidos",
    cta: "Ir a CDP vs Ventas",
  },
  {
    titulo: "Cruce CDP vs ventas (por insumo)",
    paraQue: "El cruce fino: traduce la venta a insumo por receta y la compara con el pedido, por sucursal y día. Cubre lo que tenga receta cargada en Mapeos.",
    pasos: [
      "Entrá a Cruce CDP vs ventas.",
      "Elegí el rango con Desde/Hasta.",
      'Ordená por "Mayor desvío" para ver primero lo que más se desvía.',
      "Tocá una fila para ver el desglose (qué productos lo explican).",
    ],
    href: "/cruce",
    cta: "Ir al cruce",
  },
  {
    titulo: "Atender las alertas",
    paraQue: "Que el sistema te diga qué mirar primero: quiebres, sobre-pedidos y puntos ciegos.",
    pasos: [
      "Entrá a Alertas. Mirá las críticas (rojo) primero.",
      'Usá "Ver en el cruce" para ir directo a resolverlo.',
      'Si algo no aplica ahora, "Silenciar 7d": deja de molestar y vuelve solo al vencer.',
      'Lo silenciado queda en "Silenciadas", con "Reactivar".',
    ],
    href: "/alertas",
    cta: "Ir a alertas",
  },
  {
    titulo: "Ventas por turno",
    paraQue: "Ver qué se vendió por artículo y turno (mediodía/tarde/noche), filtrando por sucursal o marca.",
    pasos: [
      "Entrá a Ventas por turno.",
      "Elegí el rango y, si querés, una sucursal o marca.",
      "Mirá el ranking de artículos y el total por turno.",
    ],
    href: "/ventas",
    cta: "Ir a ventas",
  },
  {
    titulo: "Precios (y web vs Tango)",
    paraQue: "Ver el precio vigente por producto y sucursal, y comparar el menú de la web contra Tango.",
    pasos: [
      "Entrá a Precios.",
      "Buscá el producto o filtrá por sucursal.",
      'Pestaña "Web vs Tango" para ver diferencias contra el sitio.',
    ],
    href: "/precios",
    cta: "Ir a precios",
  },
  {
    titulo: "Remitos / Compras vs Ventas",
    paraQue: "Subir un CSV de remitos o compras y cruzarlo contra las ventas de Tango, para ver cobertura por local (quién recibió sin vender, o al revés).",
    pasos: [
      "Entrá a Remitos vs Ventas o Compras vs Ventas.",
      "Subí el CSV (Compras auto-detecta las columnas).",
      "Mirá la pestaña Cobertura.",
    ],
    href: "/compras",
    cta: "Ir a compras",
  },
  {
    titulo: "Reseñas, cupones y clientes",
    paraQue: "Seguir la reputación de Google, el sistema de cupones por reseña, y el CRM de clientes que se arma con eso.",
    pasos: [
      "Reseñas: reputación y on/off del cupón.",
      "Validar cupón: canjear uno en el local.",
      "Clientes: el CRM (teléfono, visitas, cupones) que se arma solo.",
    ],
    href: "/resenas",
    cta: "Ir a reseñas",
  },
  {
    titulo: "Apertura de locales",
    paraQue: "El cuadro en vivo del estado de apertura de cada local (para gerencia y la TV del local).",
    pasos: [
      "Entrá a Apertura de locales.",
      "Actualizá el estado de cada local.",
      'Botón "Pantalla completa" para la TV, o abrí la URL /tv.',
    ],
    href: "/apertura",
    cta: "Ir a apertura",
  },
  {
    titulo: "Inventario de IT",
    paraQue: "Registrar y aprobar los recursos de infraestructura (notebooks, monitores, etc.).",
    pasos: ["Entrá a Inventario.", "Agregá o editá un ítem.", "El admin aprueba las altas."],
    href: "/inventario",
    cta: "Ir a inventario",
  },
  {
    titulo: "Editar los mapeos",
    paraQue: "Enseñarle al sistema qué insumo consume cada producto (la receta / factor) y qué sucursal es cuál. Es lo que hace posible el cruce: cuantas más recetas, menos puntos ciegos.",
    pasos: [
      "Entrá a Mapeos.",
      'Pestaña "Productos · BOM" para los factores; "Sucursales" para los códigos.',
      "Editá el valor que haga falta.",
      '"Guardar cambios" — cambia el cruce y las alertas al instante.',
    ],
    href: "/mapeos",
    cta: "Ir a mapeos",
  },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">¿Qué puedo hacer acá?</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Este tablero compara lo que cada sucursal <span className="font-medium">pide al CDP</span> contra
          lo que <span className="font-medium">vende</span> (traducido a insumo), vigila los desvíos y la
          calidad de datos, y te avisa qué resolver. Acá tenés todo lo que podés hacer y cómo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {CAPACIDADES.map((c, i) => (
          <Card key={c.titulo} className="flex flex-col p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-action/10 font-mono text-2xs font-semibold text-action">
                {i + 1}
              </span>
              <h2 className="font-display text-sm font-semibold text-ink">{c.titulo}</h2>
            </div>
            <p className="mb-2 text-xs text-muted">{c.paraQue}</p>
            <ol className="mb-3 space-y-1">
              {c.pasos.map((p, j) => (
                <li key={j} className="flex gap-2 text-xs text-ink">
                  <span className="text-faint">{j + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            <Link
              href={c.href}
              className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-action/40 hover:text-action"
            >
              {c.cta} →
            </Link>
          </Card>
        ))}
      </div>

      {/* Límite honesto */}
      <Card className="border-l-4 border-l-line p-4">
        <h2 className="font-display text-sm font-semibold text-ink">Lo que se hace en Tango (no acá)</h2>
        <p className="mt-1 text-xs text-muted">
          El tablero <span className="font-medium">lee</span> Tango y Raven, no los modifica. Cargar o cambiar
          precios, dar de baja un artículo, clasificar su marca o asignarle sucursales se hace en el maestro de
          Tango. Acá lo <span className="font-medium">detectás y controlás</span> para que el equipo de sistemas
          lo corrija, y verificás que quede limpio.
        </p>
      </Card>
    </div>
  );
}
