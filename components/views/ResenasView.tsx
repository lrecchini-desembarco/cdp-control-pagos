"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ratingDeUrl, resumenGoogle } from "@/lib/google-ratings";
import { Badge, Button, Card, EmptyState, inputClass } from "@/components/ui/primitives";

interface Local {
  nombre: string;
  googleUrl?: string;
  marca?: string;
  estado?: string;
  supervisor?: string;
  region?: string;
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
  const [cuponActivo, setCuponActivo] = useState(false);   // perilla del sistema de cupones
  const [guardandoCupon, setGuardandoCupon] = useState(false);
  const [puedeConfig, setPuedeConfig] = useState(false);   // solo admin/operaciones prenden el switch
  // Ratings efectivos de Google: live (si hay API key + refresco) fusionado sobre el
  // snapshot, o el snapshot solo. undefined = todavía no llegó -> los helpers usan la foto.
  const [ratingsMap, setRatingsMap] = useState<Record<string, { score: number; reviews: number }> | undefined>(undefined);
  const [ratingsMeta, setRatingsMeta] = useState<{ live: boolean; at: string | null } | null>(null);

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
  function cargarConfig() {
    fetch("/api/resenas-config")
      .then((r) => r.json())
      .then((j) => j.ok && setCuponActivo(Boolean(j.cuponActivo)));
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setPuedeConfig(j.ok && (j.rol === "admin" || j.rol === "operaciones")))
      .catch(() => {});
  }
  async function toggleCupon() {
    const on = !cuponActivo;
    setCuponActivo(on); // optimista
    setGuardandoCupon(true);
    try {
      const j = await (
        await fetch("/api/resenas-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cuponActivo: on }),
        })
      ).json();
      if (!j.ok) setCuponActivo(!on); // revertir (ej. sin permiso)
      else setCuponActivo(Boolean(j.cuponActivo));
    } catch {
      setCuponActivo(!on);
    } finally {
      setGuardandoCupon(false);
    }
  }

  useEffect(() => {
    const o = window.location.origin;
    setOrigin(o);
    // El QR apunta a la URL pública por defecto (configurable), no a localhost.
    const pub = process.env.NEXT_PUBLIC_PUBLIC_URL ?? "https://cdp-control-pagos.vercel.app";
    setBaseUrl(/localhost|127\.0\.0\.1/.test(o) ? pub : o);
    cargarLocales();
    cargarDerivaciones();
    cargarConfig();
    fetch("/api/google-ratings")
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setRatingsMap(j.ratings); setRatingsMeta({ live: j.live, at: j.at }); } })
      .catch(() => {});
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

  const repuGoogle = useMemo(() => resumenGoogle(locales.map((l) => l.googleUrl), ratingsMap), [locales, ratingsMap]);

  // Reputación de Google agrupada por una dimensión (supervisor / región).
  function agrupar(key: (l: Local) => string | undefined) {
    const m = new Map<string, { sumW: number; reviews: number; locales: number }>();
    for (const l of locales) {
      const r = ratingDeUrl(l.googleUrl, ratingsMap);
      if (!r) continue;
      const g = key(l);
      if (!g) continue;
      const acc = m.get(g) ?? { sumW: 0, reviews: 0, locales: 0 };
      acc.sumW += r.score * r.reviews;
      acc.reviews += r.reviews;
      acc.locales += 1;
      m.set(g, acc);
    }
    return Array.from(m, ([grupo, v]) => ({
      grupo,
      promedio: v.reviews ? v.sumW / v.reviews : 0,
      reviews: v.reviews,
      locales: v.locales,
    })).sort((a, b) => b.reviews - a.reviews);
  }
  const porSupervisor = useMemo(() => agrupar((l) => l.supervisor), [locales]);
  const porRegion = useMemo(() => agrupar((l) => l.region), [locales]);

  // Control de locales (estado del maestro): lo accionable hoy, sin depender de Tango.
  const control = useMemo(() => {
    const norm = (s?: string) => (s ?? "ABIERTO").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    return {
      abiertosSinGoogle: locales.filter((l) => norm(l.estado) === "ABIERTO" && !l.googleUrl),
      cerrados: locales.filter((l) => ["CERRADO", "EXCLUIDO"].includes(norm(l.estado))),
      proximamente: locales.filter((l) => norm(l.estado) === "PROXIMAMENTE"),
    };
  }, [locales]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Reseñas — consola</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Generá el QR para los locales, cargá el link de Google de cada uno y mirá lo que dejan los clientes.
        </p>
      </div>

      {/* Perilla del sistema de cupones */}
      <Card className="no-print flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            Sistema de cupones
            <span className={`ml-2 rounded-full px-2 py-0.5 text-2xs font-medium ${cuponActivo ? "bg-ok/10 text-ok" : "bg-ink/5 text-muted"}`}>
              {cuponActivo ? "ACTIVO" : "OCULTO"}
            </span>
          </p>
          <p className="mt-1 max-w-xl text-2xs text-muted">
            {cuponActivo
              ? "Los clientes reciben el cupón 15% OFF al calificar y el póster muestra la promo."
              : "Los clientes solo dejan la reseña en Google (sin cupón) y el póster no muestra la promo. Prendé esto cuando el cupón esté validado."}
          </p>
          {!puedeConfig && <p className="mt-1 text-2xs text-faint">Solo un Administrador u Operaciones puede cambiarlo.</p>}
        </div>
        <button
          onClick={toggleCupon}
          disabled={!puedeConfig || guardandoCupon}
          role="switch"
          aria-checked={cuponActivo}
          title={puedeConfig ? (cuponActivo ? "Apagar cupones" : "Activar cupones") : "Sin permiso"}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${cuponActivo ? "bg-ok" : "bg-ink/20"} ${!puedeConfig || guardandoCupon ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${cuponActivo ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </Card>

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

          {cuponActivo && (
            <div className="mx-auto mt-4 w-fit rounded-lg border-2 border-action px-5 py-2.5">
              <p className="font-display text-2xl font-bold leading-none text-action">🎁 15% OFF</p>
              <p className="mt-1 text-xs font-medium text-ink">en tus próximas 3 compras</p>
            </div>
          )}

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

      {/* Reputación en Google (live si hay API key + refresco; si no, snapshot/foto) */}
      <div className="mb-2 mt-1 flex flex-wrap items-center gap-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-faint">Reputación en Google</p>
        {ratingsMeta?.live ? (
          <Badge tone="ok">en vivo{ratingsMeta.at ? ` · actualizado ${new Date(ratingsMeta.at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}` : ""}</Badge>
        ) : (
          <Badge tone="warn">foto — reputación de referencia, no en tiempo real</Badge>
        )}
      </div>
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

      {/* Reputación por supervisor y por región */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RankingRepu titulo="Reputación por supervisor" filas={porSupervisor} />
        <RankingRepu titulo="Reputación por región" filas={porRegion} />
      </div>

      {/* Control de locales (maestro) */}
      <Card className="no-print overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-faint">Control de locales</span>
          <span className="text-2xs text-faint">
            🔴 {control.abiertosSinGoogle.length} abiertos sin link de Google · 🟠 {control.cerrados.length} cerrados ·
            🔵 {control.proximamente.length} próximamente
          </span>
        </div>
        {control.abiertosSinGoogle.length === 0 ? (
          <div className="p-4 text-2xs text-faint">
            Todos los locales abiertos tienen link de Google cargado. 👌
          </div>
        ) : (
          <div className="divide-y divide-line">
            <p className="px-4 pt-3 text-2xs font-medium text-bad">Abiertos sin link de Google (no pueden recibir reseñas):</p>
            {control.abiertosSinGoogle.slice(0, 30).map((l) => (
              <div key={l.nombre} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-ink">{l.nombre}</span>
                <span className="text-2xs text-faint">{l.supervisor ?? "sin supervisor"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Locales + link de Google */}
      <Card className="no-print overflow-hidden">
        <div className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">
          Locales y link de Google
        </div>
        <div className="space-y-2 p-4">
          {locales.map((l) => (
            <LocalRow key={l.nombre} local={l} ratings={ratingsMap} onGuardar={guardarLocal} onQuitar={quitar} />
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
  ratings,
  onGuardar,
  onQuitar,
}: {
  local: Local;
  ratings?: Record<string, { score: number; reviews: number }>;
  onGuardar: (nombre: string, googleUrl: string) => void;
  onQuitar: (nombre: string) => void;
}) {
  const [url, setUrl] = useState(local.googleUrl ?? "");
  const dirty = url !== (local.googleUrl ?? "");
  const rating = ratingDeUrl(local.googleUrl, ratings);
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

function RankingRepu({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { grupo: string; promedio: number; reviews: number; locales: number }[];
}) {
  return (
    <Card className="no-print overflow-hidden">
      <div className="border-b border-line px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint">
        {titulo}
      </div>
      {filas.length === 0 ? (
        <p className="px-4 py-4 text-2xs text-faint">Sin datos (faltan links de Google o el dato).</p>
      ) : (
        <div className="divide-y divide-line">
          {filas.map((f) => {
            const tono = f.promedio >= 4.3 ? "text-ok" : f.promedio >= 3.8 ? "text-warn" : "text-bad";
            return (
              <div key={f.grupo} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1 truncate text-sm text-ink">{f.grupo}</span>
                <span className="text-2xs text-faint">{f.locales} loc · {f.reviews.toLocaleString("es-AR")} reseñas</span>
                <span className={`w-14 text-right font-mono text-sm font-semibold tnum ${tono}`}>
                  {f.promedio.toFixed(2)}★
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
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
