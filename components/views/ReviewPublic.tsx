"use client";

import { useEffect, useMemo, useState } from "react";
import { BRANDS } from "@/lib/brands";

interface Local {
  nombre: string;
  googleUrl?: string;
  marca?: string;
  estado?: string;
}
const abierto = (l: Local) => (l.estado ?? "ABIERTO").toUpperCase() === "ABIERTO";

const MARCA_LABEL: Record<string, string> = {
  desembarco: "El Desembarco",
  tasty: "Mr Tasty",
  mila: "Mila & Go",
};

export default function ReviewPublic() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [local, setLocal] = useState("");
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState(""); // solo dígitos, sin el 54 9
  const [rating, setRating] = useState(0);
  const [consent, setConsent] = useState(true);
  const [fase, setFase] = useState<"form" | "listo">("form");
  const [cupon, setCupon] = useState("");
  const [vence, setVence] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("m");
    const preLocal = sp.get("l");
    setMarca(m);
    fetch("/api/locales")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        const all = (j.locales as Local[]).filter(abierto);
        const list = m ? all.filter((l) => (l.marca ?? "") === m) : all;
        setLocales(list);
        if (preLocal && all.some((l) => l.nombre === preLocal)) {
          setLocal(preLocal);
          setQ(preLocal);
        }
      })
      .catch(() => {});
  }, []);

  const localObj = useMemo(() => locales.find((l) => l.nombre === local), [locales, local]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? locales.filter((l) => l.nombre.toLowerCase().includes(t)) : locales).slice(0, 8);
  }, [locales, q]);
  const mostrarLista = q.trim().length > 0 && q !== local;

  // Tema por marca (color de acento). Cae al bordó Desembarco si no hay marca.
  const marcaActiva = marca ?? localObj?.marca ?? "desembarco";
  const brand = BRANDS.find((b) => b.id === marcaActiva) ?? BRANDS[0];
  const color = brand.color;

  const telDigits = tel.replace(/\D/g, "");
  const puedeEnviar = Boolean(local && localObj && nombre.trim().length >= 2 && telDigits.length >= 8 && rating > 0);

  async function calificar() {
    if (!puedeEnviar) return;
    setEnviando(true); setError("");
    try {
      const r = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local, marca: marcaActiva, nombre: nombre.trim(), telefono: `549${telDigits}`, rating, consent }),
      });
      const j = await r.json();
      if (!j.ok) { setError(j.error || "No se pudo procesar."); return; }
      setCupon(j.codigo);
      setVence(j.vence || "");
      setFase("listo");
      window.scrollTo(0, 0);
    } catch { setError("Fallo de red. Reintentá."); } finally { setEnviando(false); }
  }

  function irAGoogle() {
    if (!localObj?.googleUrl) return;
    try {
      fetch("/api/derivaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local }),
        keepalive: true,
      });
    } catch {}
    window.location.href = localObj.googleUrl;
  }

  // ---------- Pantalla de agradecimiento + cupón ----------
  if (fase === "listo") {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full text-3xl text-white" style={{ backgroundColor: color }}>
            ✓
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">¡Gracias por tu reseña! 🎉</h1>
          <p className="mt-1 text-sm text-muted">Tu opinión nos ayuda muchísimo a mejorar.</p>

          <div className="mt-6 overflow-hidden rounded-card border-2 border-dashed shadow-sm" style={{ borderColor: color }}>
            <div className="px-5 py-3 text-sm font-semibold text-white" style={{ backgroundColor: color }}>
              🎟️ Tu cupón de descuento
            </div>
            <div className="bg-surface px-5 py-6">
              <p className="font-mono text-3xl font-bold tracking-widest text-ink">{cupon}</p>
              <p className="mt-3 text-sm text-ink">
                <b>15% OFF</b> en tus <b>próximas 3 compras</b> en {local}.
              </p>
              <p className="mt-1 text-2xs text-faint">Mostrá este código en la caja al pagar.</p>
              {vence && (
                <p className="mt-2 text-2xs font-medium text-ink">
                  Válido hasta el {new Date(vence).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </p>
              )}
            </div>
          </div>

          {localObj?.googleUrl && (
            <button
              onClick={irAGoogle}
              className="mt-6 w-full rounded-lg px-4 py-4 text-base font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: color }}
            >
              ⭐ Dejá tu reseña en Google
            </button>
          )}
          <p className="mt-3 text-2xs text-faint">Sacale una captura al cupón así no lo perdés.</p>
        </div>
      </div>
    );
  }

  // ---------- Formulario ----------
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo / marca */}
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl font-display text-lg font-bold text-white" style={{ backgroundColor: color }}>
            {brand.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <p className="font-display text-base font-semibold text-ink">{MARCA_LABEL[marcaActiva] ?? "DS Group"}</p>
        </div>

        {/* Banner promocional */}
        <div className="mb-4 overflow-hidden rounded-card text-white shadow-sm" style={{ backgroundColor: color }}>
          <div className="px-5 py-5 text-center">
            <p className="font-display text-xl font-bold leading-tight">📣 ¡Calificá y ganá 15% OFF!</p>
            <p className="mt-1.5 text-sm text-white/90">
              Con tu calificación te llevás un <b>15% de descuento</b> en tus <b>próximas 3 compras</b> en este local.
            </p>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface p-6 shadow-sm">
          {/* Local */}
          <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">Tu local</label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-ink placeholder:text-faint focus:border-action"
            placeholder="Buscá el barrio o el nombre…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setLocal(""); }}
          />
          {mostrarLista && (
            <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-line">
              {filtrados.length === 0 ? (
                <p className="px-3 py-2 text-sm text-faint">Sin resultados…</p>
              ) : filtrados.map((l) => (
                <button key={l.nombre}
                  onClick={() => { setLocal(l.nombre); setQ(l.nombre); }}
                  className="block w-full border-b border-line px-3 py-2.5 text-left text-sm text-ink last:border-0 hover:bg-ink/5">
                  {l.nombre}
                </button>
              ))}
            </div>
          )}

          {/* Estrellas */}
          <label className="mb-1.5 mt-4 block text-2xs font-medium uppercase tracking-wide text-faint">¿Cómo estuvo tu experiencia?</label>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} estrellas`}
                className="text-4xl leading-none transition-transform hover:scale-110"
                style={{ color: n <= rating ? color : "#D9D4CC" }}
              >
                ★
              </button>
            ))}
          </div>

          {/* Nombre */}
          <label className="mb-1 mt-4 block text-2xs font-medium uppercase tracking-wide text-faint">Tu nombre</label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-ink placeholder:text-faint focus:border-action"
            placeholder="Nombre y apellido"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          {/* Teléfono con prefijo fijo */}
          <label className="mb-1 mt-4 block text-2xs font-medium uppercase tracking-wide text-faint">WhatsApp</label>
          <div className="flex items-stretch overflow-hidden rounded-lg border border-line focus-within:border-action">
            <span className="grid shrink-0 place-items-center border-r border-line bg-paper px-3 text-sm font-medium text-muted">
              🇦🇷 +54&nbsp;9
            </span>
            <input
              inputMode="numeric"
              className="w-full bg-surface px-3 py-3 text-base text-ink placeholder:text-faint focus:outline-none"
              placeholder="11 2345 6789"
              value={tel}
              onChange={(e) => setTel(e.target.value.replace(/[^\d\s-]/g, ""))}
            />
          </div>
          <p className="mt-1 text-2xs text-faint">Código de área + número, sin el 0 ni el 15.</p>

          {/* Consentimiento WhatsApp */}
          <label className="mt-4 flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>Quiero recibir promos y novedades por WhatsApp.</span>
          </label>

          {error && <p className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

          {/* Botón calificar */}
          <button
            onClick={calificar}
            disabled={!puedeEnviar || enviando}
            className="mt-5 w-full rounded-lg px-4 py-4 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: color }}
          >
            {enviando ? "Procesando…" : local ? `⭐ Calificar ${local}` : "⭐ Calificar local"}
          </button>
          {!puedeEnviar && (
            <p className="mt-2 text-center text-2xs text-faint">
              {!local ? "Elegí tu local para continuar." : rating === 0 ? "Tocá las estrellas para calificar." : "Completá tu nombre y WhatsApp."}
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-2xs text-faint">DS Group · Gracias por tu visita</p>
      </div>
    </div>
  );
}
