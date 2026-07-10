import Link from "next/link";
import { getCruce } from "@/lib/cruce";
import { getMapeos } from "@/lib/mapeos-store";
import { detectarAlertas, resumenAlertas } from "@/lib/alertas";
import { getRankingLocales } from "@/lib/actividad";
import { recentDates } from "@/lib/catalogo";
import { fmtInt, fmtPct, severidad } from "@/lib/brands";
import { pedidosSourceName } from "@/lib/sources";
import { getSesion } from "@/lib/session";
import { navDeSesion } from "@/lib/roles-store";
import { NAV_CATALOG, puedeVerNav } from "@/lib/roles";
import { Card } from "@/components/ui/primitives";
import BienvenidaGuia from "@/components/views/BienvenidaGuia";
import type { CruceRow } from "@/lib/types";

const capitalizar = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");

export const dynamic = "force-dynamic";

export default async function Page() {
  let cruce: CruceRow[] = [];
  let fuenteError: string | null = null;
  try {
    cruce = await getCruce();
  } catch (e) {
    fuenteError = e instanceof Error ? e.message : "No se pudo leer la fuente de datos.";
  }
  const mapeos = await getMapeos();
  const ranking = await getRankingLocales().catch(() => null);
  const sinMov = (ranking?.locales ?? []).filter((l) => l.estado === "sin-movimiento");
  const alertas = resumenAlertas(detectarAlertas(cruce, mapeos, sinMov, {
    refFecha: ranking?.refFecha,
    hoy: recentDates(1)[0],
  }));
  const pedidosMock = pedidosSourceName() === "mock"; // pedidos simulados => desvíos no reales

  // Herramientas que este usuario puede ver (para el cartel de bienvenida).
  const sesion = await getSesion();
  const miNav = sesion ? await navDeSesion(sesion) : [];
  const misHerramientas = NAV_CATALOG.filter((i) => puedeVerNav(miNav, i.href));
  const nombre = sesion?.email ? capitalizar(sesion.email.split("@")[0].split(/[._-]/)[0]) : undefined;

  const ultimaFecha = cruce.map((r) => r.fecha).sort().reverse()[0] ?? "—";
  const hoy = cruce.filter((r) => r.fecha === ultimaFecha);
  const pedido = hoy.reduce((s, r) => s + r.pedidoCdp, 0);
  const venta = hoy.reduce((s, r) => s + r.ventaEquiv, 0);
  const neto = pedido ? (pedido - venta) / pedido : 0;
  const fuera = hoy.filter((r) => {
    const pct = r.pedidoCdp ? (r.pedidoCdp - r.ventaEquiv) / r.pedidoCdp : 0;
    return severidad(pct) !== "ok";
  }).length;
  const activas = mapeos.sucursales.filter((s) => s.activa).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Resumen</h1>
          <p className="mt-0.5 text-sm text-muted">Estado de la operación CDP al {ultimaFecha}.</p>
        </div>
        <Link
          href="/guia"
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-action/40 hover:text-action"
        >
          ¿Qué puedo hacer? →
        </Link>
      </div>

      <BienvenidaGuia items={misHerramientas} nombre={nombre} />

      {fuenteError && (
        <Card className="border-bad/20 bg-bad/5 p-4">
          <p className="text-sm font-medium text-bad">No se pudo leer la fuente de datos</p>
          <p className="mt-1 text-xs text-muted">{fuenteError}</p>
          <p className="mt-1 text-2xs text-faint">
            Configurá las variables de entorno (Raven + Tango) o usá <span className="font-mono">DATA_SOURCE=mock</span> para desarrollo. Ver <span className="font-mono">README</span> / <span className="font-mono">docs/datos.md</span>.
          </p>
        </Card>
      )}

      {/* Aviso: pedidos simulados => Desvío neto / Líneas a revisar / alertas NO son reales */}
      {pedidosMock && !fuenteError && (
        <Card className="border-l-4 border-l-warn/60 bg-warn/5 p-3">
          <p className="text-xs text-ink">
            <b className="text-warn">Modo demo:</b> los pedidos al CDP son <b>simulados</b> — las ventas sí son reales de Tango,
            pero el <b>Desvío neto</b>, las <b>Líneas a revisar</b> y las alertas de quiebre/sobre-pedido salen del pedido y
            <b> no representan la operación real</b> hasta activar <code className="rounded bg-paper px-1">PEDIDOS_SOURCE=live</code>.
          </p>
        </Card>
      )}

      {/* Banda de alertas: lo primero que tiene que ver el operador al entrar */}
      <Link href="/alertas">
        <Card
          className={`group flex items-center gap-3 p-4 transition-colors ${
            alertas.critica > 0
              ? "border-bad/30 bg-bad/5 hover:border-bad/50"
              : alertas.total > 0
              ? "border-warn/30 bg-warn/5 hover:border-warn/50"
              : "hover:border-action/40"
          }`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-bold ${
              alertas.critica > 0
                ? "bg-bad/15 text-bad"
                : alertas.total > 0
                ? "bg-warn/15 text-warn"
                : "bg-ok/15 text-ok"
            }`}
          >
            {alertas.total > 0 ? "!" : "✓"}
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold text-ink">
              {alertas.total === 0
                ? "Sin alertas abiertas"
                : `${alertas.total} alerta${alertas.total === 1 ? "" : "s"} abiertas`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {alertas.total === 0
                ? "El control está al día: ningún desvío ni punto ciego."
                : `${alertas.critica} críticas · ${alertas.alta} altas · ${alertas.media} medias`}
            </p>
          </div>
          <span className="text-sm font-medium text-muted group-hover:text-action">Ver alertas →</span>
        </Card>
      </Link>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedido al CDP" value={fmtInt(pedido)} sub="último día" />
        <Stat label="Venta equivalente" value={fmtInt(venta)} sub="traducida a insumo" />
        <Stat label="Desvío neto" value={fmtPct(neto)} sub="pedido vs venta" tone={severidad(neto)} />
        <Stat
          label="Líneas a revisar"
          value={`${fuera} / ${hoy.length}`}
          sub="fuera de ±5%"
          tone={fuera === 0 ? "ok" : "warn"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Access
          href="/pedidos"
          title="CDP vs Ventas (local)"
          desc="Lo que cada local pidió al CDP contra lo que vendió."
        />
        <Access
          href="/cruce"
          title="Cruce CDP vs ventas"
          desc="Detectá sobre-pedido y faltantes por sucursal y producto."
        />
        <Access
          href="/listas"
          title="Precios y margen"
          desc="Costo de receta, CMV y margen por lista y producto."
        />
        <Access
          href="/mapeos"
          title="Mapeos"
          desc={`${activas} sucursales activas · ${mapeos.productoMap.length} reglas de producto.`}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tnum ${color}`}>{value}</p>
      <p className="mt-0.5 text-2xs text-faint">{sub}</p>
    </Card>
  );
}

function Access({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="group p-4 transition-colors hover:border-action/40">
        <p className="font-display text-sm font-semibold text-ink group-hover:text-action">{title} →</p>
        <p className="mt-1 text-xs text-muted">{desc}</p>
      </Card>
    </Link>
  );
}
