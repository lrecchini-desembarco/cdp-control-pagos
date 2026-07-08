"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { brandById } from "@/lib/brands";
import type { Alerta, AlertaTipo, ResumenAlertas, Severidad } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";

const RESUMEN_VACIO: ResumenAlertas = { total: 0, critica: 0, alta: 0, media: 0, info: 0 };

// Metadatos de presentación: cómo se ve cada nivel de urgencia.
const SEV: Record<
  Severidad,
  { label: string; rail: string; dot: string; tone: "bad" | "warn" | "neutral" }
> = {
  critica: { label: "Crítica", rail: "border-l-bad", dot: "bg-bad", tone: "bad" },
  alta: { label: "Alta", rail: "border-l-warn", dot: "bg-warn", tone: "warn" },
  media: { label: "Media", rail: "border-l-line", dot: "bg-faint", tone: "neutral" },
  info: { label: "Info", rail: "border-l-line", dot: "bg-faint", tone: "neutral" },
};

// Etiqueta legible de cada regla, para el filtro y el "kicker" de la tarjeta.
const TIPO: Record<AlertaTipo, string> = {
  quiebre: "Quiebre",
  sobrepedido: "Sobre-pedido",
  recurrente: "Recurrente",
  "sucursal-sin-mapear": "Punto ciego · sucursal",
  "insumo-sin-receta": "Punto ciego · insumo",
};

type FiltroSev = "todas" | Severidad;
type FiltroTipo = "todos" | AlertaTipo;

type Status = "loading" | "ok" | "error";

export default function AlertasView() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [silenciadas, setSilenciadas] = useState<Alerta[]>([]);
  const [resumen, setResumen] = useState<ResumenAlertas>(RESUMEN_VACIO);
  const [status, setStatus] = useState<Status>("loading");
  const [errMsg, setErrMsg] = useState("");

  const [sev, setSev] = useState<FiltroSev>("todas");
  const [tipo, setTipo] = useState<FiltroTipo>("todos");

  const [notifBusy, setNotifBusy] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function enviarResumen() {
    setNotifBusy(true);
    setNotifMsg(null);
    try {
      const r = await fetch("/api/notify", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "No se pudo enviar.");
      const text =
        j.canal === "none"
          ? "Canal sin configurar: poné NOTIFY_CHANNEL=email + SMTP_USER/SMTP_PASS/NOTIFY_EMAIL_TO para que se envíe solo."
          : j.enviado
          ? `Resumen enviado por ${j.canal}.`
          : j.info;
      setNotifMsg({ ok: j.enviado || j.canal === "none", text });
    } catch (e) {
      setNotifMsg({ ok: false, text: e instanceof Error ? e.message : "Error al enviar." });
    } finally {
      setNotifBusy(false);
    }
  }

  async function cargar() {
    setStatus("loading");
    try {
      const r = await fetch("/api/alertas");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "No se pudieron calcular las alertas.");
      setAlertas(j.alertas as Alerta[]);
      setSilenciadas((j.silenciadas as Alerta[]) ?? []);
      setResumen(j.resumen as ResumenAlertas);
      setStatus("ok");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error desconocido.");
      setStatus("error");
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  async function silenciar(id: string) {
    await fetch("/api/silencios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dias: 7 }),
    });
    cargar();
  }
  async function reactivar(id: string) {
    await fetch(`/api/silencios?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    cargar();
  }

  const visibles = useMemo(
    () =>
      alertas.filter(
        (a) => (sev === "todas" || a.severidad === sev) && (tipo === "todos" || a.tipo === tipo)
      ),
    [alertas, sev, tipo]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Alertas</h1>
          <p className="mt-0.5 text-sm text-muted">
            Todo lo que merece atención hoy, ordenado por urgencia. El sistema vigila los datos por vos
            y te dice qué pasa, por qué importa y dónde resolverlo.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Button variant="outline" className="!py-1.5 !text-xs" onClick={enviarResumen} disabled={notifBusy}>
            {notifBusy ? "Enviando…" : "Enviar resumen ahora"}
          </Button>
          {notifMsg && (
            <p className={`mt-1.5 max-w-[260px] text-2xs ${notifMsg.ok ? "text-ok" : "text-warn"}`}>
              {notifMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* KPIs por severidad */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Críticas" value={resumen.critica} tone="bad" />
        <Kpi label="Altas" value={resumen.alta} tone="warn" />
        <Kpi label="Medias" value={resumen.media} tone="neutral" />
        <Kpi label="Total abiertas" value={resumen.total} tone="neutral" />
      </div>

      {/* Filtros */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-faint">Urgencia</span>
        {(["todas", "critica", "alta", "media"] as FiltroSev[]).map((s) => (
          <Chip key={s} active={sev === s} onClick={() => setSev(s)}>
            {s === "todas" ? "Todas" : SEV[s as Severidad].label}
          </Chip>
        ))}
        <span className="mx-2 h-4 w-px bg-line" />
        <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-faint">Tipo</span>
        {(["todos", ...Object.keys(TIPO)] as FiltroTipo[]).map((t) => (
          <Chip key={t} active={tipo === t} onClick={() => setTipo(t)}>
            {t === "todos" ? "Todos" : TIPO[t as AlertaTipo]}
          </Chip>
        ))}
      </Card>

      {/* Lista */}
      {status === "loading" ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : status === "error" ? (
        <ErrorState msg={errMsg} onRetry={cargar} />
      ) : visibles.length === 0 ? (
        <EmptyState
          title={alertas.length === 0 ? "Todo en orden" : "Sin alertas para este filtro"}
          desc={
            alertas.length === 0
              ? "No hay desvíos fuera de tolerancia ni puntos ciegos. El control está al día."
              : "Probá quitar filtros para ver el resto de las alertas."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {visibles.map((a) => (
            <AlertaCard key={a.id} a={a} onSilenciar={() => silenciar(a.id)} />
          ))}
        </div>
      )}

      {/* Silenciadas */}
      {silenciadas.length > 0 && (
        <details className="rounded-card border border-line bg-surface">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink">
            Silenciadas ({silenciadas.length})
            <span className="ml-2 text-2xs font-normal text-faint">
              no cuentan ni notifican hasta que venzan o las reactives
            </span>
          </summary>
          <div className="divide-y divide-line border-t border-line">
            {silenciadas.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-xs text-muted line-through">{a.titulo}</span>
                <button
                  onClick={() => reactivar(a.id)}
                  className="text-2xs font-medium text-action hover:underline"
                >
                  Reactivar
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <ComoFunciona />
    </div>
  );
}

function AlertaCard({ a, onSilenciar }: { a: Alerta; onSilenciar: () => void }) {
  const sev = SEV[a.severidad];
  return (
    <Card className={`border-l-4 ${sev.rail} p-4`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${sev.dot}`} />
        <span className="text-2xs font-medium uppercase tracking-wide text-faint">{TIPO[a.tipo]}</span>
        <div className="ml-auto flex items-center gap-2">
          {a.metrica && (
            <span className="font-mono text-2xs font-semibold text-muted tnum">{a.metrica}</span>
          )}
          <Badge tone={sev.tone}>{sev.label}</Badge>
        </div>
      </div>

      <p className="font-display text-sm font-semibold text-ink">{a.titulo}</p>
      <p className="mt-1 text-xs text-muted">{a.detalle}</p>

      <p className="mt-2 text-2xs leading-relaxed text-faint">
        <span className="font-medium text-muted">Por qué importa · </span>
        {a.porque}
      </p>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        {a.brand && (
          <span className="inline-flex items-center gap-1.5 text-2xs text-faint">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: brandById(a.brand).color }}
            />
            {brandById(a.brand).name}
          </span>
        )}
        {a.fecha && <span className="text-2xs text-faint">· {a.fecha}</span>}
        <button
          onClick={onSilenciar}
          className="ml-auto text-2xs font-medium text-faint hover:text-muted"
          title="Posponer 7 días"
        >
          Silenciar 7d
        </button>
        <Link
          href={a.accion.href}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-action/40 hover:text-action"
        >
          {a.accion.label} →
        </Link>
      </div>
    </Card>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "bad" | "warn" | "neutral";
}) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tnum ${value === 0 ? "text-faint" : color}`}>
        {value}
      </p>
    </Card>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${
        active
          ? "border-action bg-action/10 text-action"
          : "border-line text-muted hover:bg-ink/5"
      }`}
    >
      {children}
    </button>
  );
}

/** Documentación embebida: explica en criollo cómo se calcula cada alerta. */
function ComoFunciona() {
  const reglas = [
    {
      t: "Quiebre",
      d: "Una sucursal vendió (traducido a insumo) más de un 15% por encima de lo que pidió al CDP en el último día. Sobre 25% es crítico: se está por quedar sin stock.",
    },
    {
      t: "Sobre-pedido",
      d: "Pidió más de un 15% por encima de lo que explican sus ventas. Es exceso de stock: capital inmovilizado y riesgo de merma.",
    },
    {
      t: "Recurrente",
      d: "El mismo sucursal + insumo quedó fuera de ±15% en 3 o más de los últimos días. Repetirse lo convierte en problema sistemático, no en ruido.",
    },
    {
      t: "Punto ciego · sucursal",
      d: "Una sucursal activa que Raven reporta pero que no tiene código canónico: no entra al cruce, así que vende y pide sin control.",
    },
    {
      t: "Punto ciego · insumo",
      d: "Un insumo que el CDP despacha pero sin receta cargada: no se puede contrastar contra ventas hasta que se le defina la regla.",
    },
  ];
  return (
    <details className="rounded-card border border-line bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink">
        ¿Cómo se calcula cada alerta?
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-3">
        {reglas.map((r) => (
          <div key={r.t}>
            <p className="text-xs font-semibold text-ink">{r.t}</p>
            <p className="mt-0.5 text-xs text-muted">{r.d}</p>
          </div>
        ))}
        <p className="border-t border-line pt-3 text-2xs text-faint">
          La tolerancia (±15%) y los umbrales de gravedad están centralizados en{" "}
          <span className="font-mono">lib/alertas.ts</span> y se ajustan en un solo lugar.
        </p>
      </div>
    </details>
  );
}
