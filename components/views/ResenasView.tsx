"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ratingDeUrl, resumenGoogle } from "@/lib/google-ratings";
import { Badge, Button, Card, EmptyState, inputClass } from "@/components/ui/primitives";

interface Local {
  nombre: string;
  googleUrl?: string;
}
interface Review {
  id: string;
  creadoEn: string;
  local: string;
  estrellas: number;
  comentario: string;
}
interface Resumen {
  total: number;
  promedio: number;
  porEstrella: Record<number, number>;
}

export default function ResenasView() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [resumen, setResumen] = useState<Resumen>({ total: 0, promedio: 0, porEstrella: {} });
  const [qr, setQr] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", googleUrl: "" });
  const [filtro, setFiltro] = useState("");

  function cargarLocales() {
    fetch("/api/locales")
      .then((r) => r.json())
      .then((j) => j.ok && setLocales(j.locales));
  }
  function cargarReviews() {
    fetch("/api/reviews")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setReviews(j.reviews);
          setResumen(j.resumen);
        }
      });
  }

  useEffect(() => {
    const url = `${window.location.origin}/review`;
    setReviewUrl(url);
    QRCode.toDataURL(url, { width: 260, margin: 1 }).then(setQr).catch(() => {});
    cargarLocales();
    cargarReviews();
  }, []);

  async function guardarLocal(nombre: string, googleUrl: string) {
    const j = await (
      await fetch("/api/locales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, googleUrl }),
      })
    ).json();
    if (j.ok) setLocales(j.locales);
  }
  async function agregar() {
    if (!nuevo.nombre.trim()) return;
    await guardarLocal(nuevo.nombre, nuevo.googleUrl);
    setNuevo({ nombre: "", googleUrl: "" });
  }
  async function quitar(nombre: string) {
    const j = await (await fetch(`/api/locales?nombre=${encodeURIComponent(nombre)}`, { method: "DELETE" })).json();
    if (j.ok) setLocales(j.locales);
  }

  const visibles = useMemo(
    () => (filtro ? reviews.filter((r) => r.local === filtro) : reviews),
    [reviews, filtro]
  );

  const repuGoogle = useMemo(() => resumenGoogle(locales.map((l) => l.googleUrl)), [locales]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Reseñas — consola</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Generá el QR para los locales, cargá el link de Google de cada uno y mirá lo que dejan los clientes.
        </p>
      </div>

      {/* QR general (imprimible) */}
      <div id="print-area">
        <Card className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:items-center">
          {qr ? (
            <img src={qr} alt="QR de reseñas" className="h-40 w-40 shrink-0 rounded-lg border border-line" />
          ) : (
            <div className="h-40 w-40 shrink-0 rounded-lg bg-ink/5" />
          )}
          <div className="text-center sm:text-left">
            <p className="font-display text-base font-semibold text-ink">QR de reseñas (general)</p>
            <p className="mt-1 text-sm text-muted">
              Imprimilo y pegalo en cada local. El cliente lo escanea, elige su local y deja la reseña.
            </p>
            <p className="mt-2 break-all font-mono text-2xs text-faint">{reviewUrl}</p>
            <div className="no-print mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {qr && (
                <a
                  href={qr}
                  download="qr-resenas-ds.png"
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action"
                >
                  Descargar PNG
                </a>
              )}
              <Button variant="outline" className="!py-1.5 !text-xs" onClick={() => window.print()}>
                Imprimir QR
              </Button>
              <a
                href="/review"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action"
              >
                Ver pantalla del cliente →
              </a>
            </div>
          </div>
        </Card>
      </div>

      {/* Reputación en Google (snapshot del Excel) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Locales en Google" value={String(repuGoogle.locales)} />
        <Kpi
          label="Promedio Google"
          value={repuGoogle.locales ? `${repuGoogle.promedio.toFixed(2)} ★` : "—"}
          tone={repuGoogle.promedio >= 4.3 ? "ok" : repuGoogle.promedio >= 3.8 ? "warn" : repuGoogle.locales ? "bad" : undefined}
        />
        <Kpi label="Reseñas Google (total)" value={repuGoogle.totalReviews.toLocaleString("es-AR")} />
        <Kpi label="Reseñas internas" value={String(resumen.total)} />
      </div>

      {/* Locales + link de Google */}
      <Card className="no-print overflow-hidden">
        <div className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">
          Locales y link de Google
        </div>
        <div className="space-y-2 p-4">
          {locales.map((l) => (
            <LocalRow key={l.nombre} local={l} onGuardar={guardarLocal} onQuitar={quitar} />
          ))}
          {/* Alta */}
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3 sm:flex-row">
            <input
              className={inputClass}
              placeholder="Nombre del local nuevo"
              value={nuevo.nombre}
              onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Link de Google (opcional)"
              value={nuevo.googleUrl}
              onChange={(e) => setNuevo((n) => ({ ...n, googleUrl: e.target.value }))}
            />
            <Button className="shrink-0" onClick={agregar} disabled={!nuevo.nombre.trim()}>
              Agregar
            </Button>
          </div>
          <p className="text-2xs text-faint">
            El link de Google es el de “escribir reseña” del local (Google Maps → Reseñas → Escribir → copiar
            enlace). Si no lo cargás, el cliente igual deja su reseña interna.
          </p>
        </div>
      </Card>

      {/* Reseñas recibidas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Reseñas recibidas" value={String(resumen.total)} />
        <Kpi
          label="Promedio"
          value={resumen.total ? `${resumen.promedio.toFixed(1)} ★` : "—"}
          tone={resumen.promedio >= 4 ? "ok" : resumen.promedio >= 3 ? "warn" : resumen.total ? "bad" : undefined}
        />
        <Kpi label="5★" value={String(resumen.porEstrella?.[5] ?? 0)} />
        <Kpi label="1–2★" value={String((resumen.porEstrella?.[1] ?? 0) + (resumen.porEstrella?.[2] ?? 0))} tone="bad" />
      </div>

      <Card className="no-print overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-faint">Reseñas de clientes</span>
          <select className={`${inputClass} max-w-[200px] py-1`} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos los locales</option>
            {locales.map((l) => (
              <option key={l.nombre} value={l.nombre}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
        {visibles.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Sin reseñas todavía" desc="Cuando los clientes escaneen el QR y opinen, vas a verlas acá." />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {visibles.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-20 shrink-0 text-warn" title={`${r.estrellas} estrellas`}>
                  {"★".repeat(r.estrellas)}
                  <span className="text-line">{"★".repeat(5 - r.estrellas)}</span>
                </span>
                <div className="flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{r.local}</span>
                    {r.comentario ? <span className="text-muted"> — {r.comentario}</span> : null}
                  </p>
                  <p className="mt-0.5 text-2xs text-faint">{new Date(r.creadoEn).toLocaleString("es-AR")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function LocalRow({
  local,
  onGuardar,
  onQuitar,
}: {
  local: Local;
  onGuardar: (nombre: string, googleUrl: string) => void;
  onQuitar: (nombre: string) => void;
}) {
  const [url, setUrl] = useState(local.googleUrl ?? "");
  const dirty = url !== (local.googleUrl ?? "");
  const rating = ratingDeUrl(local.googleUrl);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3 sm:flex-row sm:items-center">
      <span className="w-52 shrink-0 text-sm font-medium text-ink">
        {local.nombre}
        {rating ? (
          <span className="ml-2 whitespace-nowrap text-2xs font-normal text-warn" title={`${rating.reviews} reseñas en Google`}>
            ★ {rating.score} <span className="text-faint">({rating.reviews})</span>
          </span>
        ) : local.googleUrl ? (
          <Badge tone="ok">Google ✓</Badge>
        ) : null}
      </span>
      <input
        className={inputClass}
        placeholder="Link de Google (escribir reseña)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button
        variant="outline"
        className="!py-1.5 !text-xs"
        onClick={() => onGuardar(local.nombre, url)}
        disabled={!dirty}
      >
        Guardar
      </Button>
      <button onClick={() => onQuitar(local.nombre)} className="text-2xs font-medium text-bad hover:underline">
        Quitar
      </button>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tnum ${color}`}>{value}</p>
    </Card>
  );
}
