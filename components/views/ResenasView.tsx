"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ratingDeUrl, resumenGoogle } from "@/lib/google-ratings";
import { Badge, Button, Card, EmptyState, inputClass } from "@/components/ui/primitives";

interface Local {
  nombre: string;
  googleUrl?: string;
  marca?: string;
}
interface Derivaciones {
  total: number;
  porLocal: { local: string; cantidad: number }[];
}

export default function ResenasView() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [deriv, setDeriv] = useState<Derivaciones>({ total: 0, porLocal: [] });
  const [qr, setQr] = useState("");
  const [qrSel, setQrSel] = useState("general"); // "general" | "marca:<slug>" | "local:<nombre>"
  const [origin, setOrigin] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", googleUrl: "", marca: "desembarco" });

  const MARCA_LABEL: Record<string, string> = {
    desembarco: "El Desembarco",
    tasty: "Mr Tasty",
    mila: "Mila & Go",
    otros: "Otros",
  };
  // Marcas con locales cargados (se actualiza solo al sumar locales de otra marca).
  const marcasPresentes = Array.from(new Set(locales.map((l) => l.marca || "otros")));

  const base = (baseUrl || origin).replace(/\/+$/, "");
  const targetUrl = (sel: string) => {
    if (!base) return "";
    if (sel.startsWith("marca:")) return `${base}/review?m=${sel.slice(6)}`;
    if (sel.startsWith("local:")) return `${base}/review?l=${encodeURIComponent(sel.slice(6))}`;
    return `${base}/review`;
  };
  const targetTitulo = (sel: string) => {
    if (sel.startsWith("marca:")) return MARCA_LABEL[sel.slice(6)] ?? "DS Group";
    if (sel.startsWith("local:")) return sel.slice(6);
    return "DS Group";
  };
  const reviewUrl = targetUrl(qrSel);
  const posterTitulo = targetTitulo(qrSel);
  const qrFile = "qr-resenas-" + qrSel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  function cargarLocales() {
    fetch("/api/locales")
      .then((r) => r.json())
      .then((j) => j.ok && setLocales(j.locales));
  }
  function cargarDerivaciones() {
    fetch("/api/derivaciones")
      .then((r) => r.json())
      .then((j) => j.ok && setDeriv(j.resumen));
  }

  useEffect(() => {
    const o = window.location.origin;
    setOrigin(o);
    setBaseUrl(o);
    cargarLocales();
    cargarDerivaciones();
  }, []);
  useEffect(() => {
    if (reviewUrl) QRCode.toDataURL(reviewUrl, { width: 320, margin: 1 }).then(setQr).catch(() => {});
  }, [reviewUrl]);

  async function guardarLocal(nombre: string, googleUrl: string, marca?: string) {
    const j = await (
      await fetch("/api/locales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, googleUrl, marca }),
      })
    ).json();
    if (j.ok) setLocales(j.locales);
  }
  async function agregar() {
    if (!nuevo.nombre.trim()) return;
    await guardarLocal(nuevo.nombre, nuevo.googleUrl, nuevo.marca);
    setNuevo({ nombre: "", googleUrl: "", marca: "desembarco" });
  }
  async function quitar(nombre: string) {
    const j = await (await fetch(`/api/locales?nombre=${encodeURIComponent(nombre)}`, { method: "DELETE" })).json();
    if (j.ok) setLocales(j.locales);
  }

  const repuGoogle = useMemo(() => resumenGoogle(locales.map((l) => l.googleUrl)), [locales]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Reseñas — consola</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Generá el QR para los locales, cargá el link de Google de cada uno y mirá lo que dejan los clientes.
        </p>
      </div>

      {/* Generador de QR: general, por marca y por local */}
      <Card className="no-print p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-faint">QR para</span>
          <Chip active={qrSel === "general"} onClick={() => setQrSel("general")}>
            General (todas)
          </Chip>
          {marcasPresentes.map((m) => (
            <Chip key={m} active={qrSel === `marca:${m}`} onClick={() => setQrSel(`marca:${m}`)}>
              {MARCA_LABEL[m] ?? m}
            </Chip>
          ))}
          <div className="ml-auto flex gap-2">
            {qr && (
              <a
                href={qr}
                download={`${qrFile}.png`}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action"
              >
                Descargar PNG
              </a>
            )}
            <Button variant="outline" className="!py-1.5 !text-xs" onClick={() => window.print()}>
              Imprimir póster
            </Button>
            <a
              href={reviewUrl || "/review"}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action"
            >
              Probar →
            </a>
          </div>
        </div>
        {/* QR por local puntual */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="mr-1 text-2xs font-medium uppercase tracking-wide text-faint">o por local</span>
          <select
            className={`${inputClass} max-w-[280px] py-1`}
            value={qrSel.startsWith("local:") ? qrSel.slice(6) : ""}
            onChange={(e) => e.target.value && setQrSel(`local:${e.target.value}`)}
          >
            <option value="">— Elegí un local puntual —</option>
            {locales.map((l) => (
              <option key={l.nombre} value={l.nombre}>
                {l.nombre}
              </option>
            ))}
          </select>
          {qrSel.startsWith("local:") && (
            <span className="text-2xs text-action">QR directo a {qrSel.slice(6)} (sin elegir local)</span>
          )}
        </div>
        {/* URL pública del QR (en prod se completa sola con el dominio) */}
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          <label className="text-2xs font-medium uppercase tracking-wide text-faint">URL pública (para el QR)</label>
          <input
            className={inputClass}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://tudominio.com"
          />
          <p className="mt-1 break-all font-mono text-2xs text-faint">QR → {reviewUrl}</p>
          {/localhost|127\.0\.0\.1/.test(base) && (
            <p className="mt-1 text-2xs text-warn">
              ⚠ El QR apunta a <b>localhost</b>: solo abre en esta compu. Para escanearlo desde el celular,
              poné acá tu dominio público (o tu túnel) — o publicá el sitio (deploy).
            </p>
          )}
        </div>
      </Card>

      {/* Póster imprimible (esto es lo único que sale en la impresión) */}
      <div id="print-area" className="flex justify-center">
        <div className="poster w-full max-w-sm rounded-card border border-line bg-surface px-8 py-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-action">{posterTitulo}</p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight text-ink">
            ¿Cómo estuvo tu experiencia?
          </h2>
          <p className="mt-2 text-sm text-muted">Escaneá el código y dejanos tu reseña. ¡Te lleva 20 segundos!</p>

          <div className="my-7 flex justify-center">
            {qr ? (
              <img src={qr} alt="QR de reseñas" className="h-60 w-60 rounded-xl border-4 border-ink p-1" />
            ) : (
              <div className="h-60 w-60 rounded-xl bg-ink/5" />
            )}
          </div>

          <p className="text-2xl tracking-widest text-warn">★★★★★</p>
          <p className="mt-2 text-sm font-medium text-ink">Apuntá la cámara del celular al código</p>
          <p className="mt-6 text-2xs text-faint">DS Group · Sistema de reseñas</p>
        </div>
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
        <Kpi label="Derivaciones a Google" value={String(deriv.total)} />
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
            <select
              className={`${inputClass} sm:max-w-[160px]`}
              value={nuevo.marca}
              onChange={(e) => setNuevo((n) => ({ ...n, marca: e.target.value }))}
            >
              <option value="desembarco">El Desembarco</option>
              <option value="tasty">Mr Tasty</option>
              <option value="mila">Mila & Go</option>
              <option value="otros">Otros</option>
            </select>
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
            enlace). Sin ese link, el cliente no puede calificar ese local.
          </p>
        </div>
      </Card>

      {/* Derivaciones a Google (embudo) */}
      <Card className="no-print overflow-hidden">
        <div className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">
          Derivaciones a Google · {deriv.total} en total
        </div>
        {deriv.porLocal.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin derivaciones todavía"
              desc="Cuando un cliente escanee el QR, elija su local y toque “Calificar en Google”, lo vas a contar acá."
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {deriv.porLocal.map((d) => (
              <div key={d.local} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-ink">{d.local}</span>
                <span className="font-mono text-sm tnum text-muted">{d.cantidad}</span>
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

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active ? "border-action bg-action/10 text-action" : "border-line text-muted hover:bg-ink/5"
      }`}
    >
      {children}
    </button>
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
