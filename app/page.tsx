import Link from "next/link";
import { buildCruce, SUCURSALES, PRODUCTO_MAP } from "@/lib/mock";
import { fmtInt, fmtPct, severidad } from "@/lib/brands";
import { Card } from "@/components/ui/primitives";

export default function Page() {
  const cruce = buildCruce();
  const ultimaFecha = cruce.map((r) => r.fecha).sort().reverse()[0];
  const hoy = cruce.filter((r) => r.fecha === ultimaFecha);
  const pedido = hoy.reduce((s, r) => s + r.pedidoCdp, 0);
  const venta = hoy.reduce((s, r) => s + r.ventaEquiv, 0);
  const neto = pedido ? (pedido - venta) / pedido : 0;
  const fuera = hoy.filter((r) => {
    const pct = r.pedidoCdp ? (r.pedidoCdp - r.ventaEquiv) / r.pedidoCdp : 0;
    return severidad(pct) !== "ok";
  }).length;
  const activas = SUCURSALES.filter((s) => s.activa).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Resumen</h1>
        <p className="mt-0.5 text-sm text-muted">
          Estado de la operación CDP al {ultimaFecha}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedido al CDP" value={fmtInt(pedido)} sub="último día" />
        <Stat label="Venta equivalente" value={fmtInt(venta)} sub="traducida a insumo" />
        <Stat
          label="Desvío neto"
          value={fmtPct(neto)}
          sub="pedido vs venta"
          tone={severidad(neto)}
        />
        <Stat
          label="Líneas a revisar"
          value={`${fuera} / ${hoy.length}`}
          sub="fuera de ±5%"
          tone={fuera === 0 ? "ok" : "warn"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Access
          href="/cruce"
          title="Cruce CDP vs ventas"
          desc="Detectá sobre-pedido y faltantes por sucursal y producto."
        />
        <Access
          href="/raven"
          title="Consultar Raven"
          desc="Traé los pedidos de un producto para una fecha de entrega."
        />
        <Access
          href="/mapeos"
          title="Mapeos"
          desc={`${activas} sucursales activas · ${PRODUCTO_MAP.length} reglas de producto.`}
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
        <p className="font-display text-sm font-semibold text-ink group-hover:text-action">
          {title} →
        </p>
        <p className="mt-1 text-xs text-muted">{desc}</p>
      </Card>
    </Link>
  );
}
