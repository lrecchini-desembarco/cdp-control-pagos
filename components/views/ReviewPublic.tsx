"use client";

// Circuito de reseñas (v2): la ÚNICA reseña es la de Google.
// 1) El cliente deja local + nombre + WhatsApp.
// 2) Lo mandamos a Google a dejar la reseña (paso obligatorio; ya no
//    existe la calificación interna: si el cupón llegaba antes, nadie
//    calificaba en Google).
// 3) Al volver, canjea: recién ahí se emite el cupón 15% OFF.
// El estado se persiste en sessionStorage por si Google se abre en la
// misma pestaña (in-app browsers) y el cliente vuelve con "atrás".

import { useEffect, useMemo, useRef, useState } from "react";
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

const FALLBACK_MS = 7000; // si no detectamos el regreso de Google, habilitamos igual
const SS_KEY = "review-en-google";

export default function ReviewPublic() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [local, setLocal] = useState("");
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState(""); // solo dígitos, sin el 54 9
  const [consent, setConsent] = useState(true);
  const [fase, setFase] = useState<"form" | "google" | "listo">("form");
  const [volvio, setVolvio] = useState(false); // true cuando el cliente vuelve de Google
  const [cupon, setCupon] = useState("");
  const [vence, setVence] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const googleAbierto = useRef(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("m");
    const preLocal = sp.get("l");
    setMarca(m);

    // si volvió de Google (misma pestaña + atrás), retomamos donde estaba
    try {
      const guardado = sessionStorage.getItem(SS_KEY);
      if (guardado) {
        const s = JSON.parse(guardado);
        setLocal(s.local ?? "");
        setQ(s.local ?? "");
        setNombre(s.nombre ?? "");
        setTel(s.tel ?? "");
        setConsent(s.consent ?? true);
        setFase("google");
        setVolvio(true); // ya pasó por Google y volvió: puede canjear
      }
    } catch {}

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

  // Detectar el REGRESO de Google: cuando el cliente vuelve a esta pantalla
  // (cambia de pestaña/app o toca "atrás"), habilitamos el descuento al instante.
  // Fallback por si el navegador no dispara el evento (algunos in-app browsers).
  useEffect(() => {
    if (fase !== "google" || volvio) return;
    const marcarVuelta = () => { if (document.visibilityState === "visible") setVolvio(true); };
    document.addEventListener("visibilitychange", marcarVuelta);
    window.addEventListener("focus", marcarVuelta);
    window.addEventListener("pageshow", marcarVuelta);
    const t = setTimeout(() => setVolvio(true), FALLBACK_MS);
    return () => {
      document.removeEventListener("visibilitychange", marcarVuelta);
      window.removeEventListener("focus", marcarVuelta);
      window.removeEventListener("pageshow", marcarVuelta);
      clearTimeout(t);
    };
  }, [fase, volvio]);

  const localObj = useMemo(() => locales.find((l) => l.nombre === local), [locales, local]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? locales.filter((l) => l.nombre.toLowerCase().includes(t)) : locales).slice(0, 8);
  }, [locales, q]);
  const mostrarLista = q.trim().length > 0 && q !== local;

  const marcaActiva = marca ?? localObj?.marca ?? "desembarco";
  const brand = BRANDS.find((b) => b.id === marcaActiva) ?? BRANDS[0];
  const color = brand.color;

  const telDigits = tel.replace(/\D/g, "");
  const datosCompletos = Boolean(local && localObj && nombre.trim().length >= 2 && telDigits.length >= 8);

  // Paso 2: derivar a Google (la reseña es ahí, no acá)
  function irAGoogle() {
    if (!datosCompletos) return;
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ local, nombre, tel, consent }));
    } catch {}
    try {
      fetch("/api/derivaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local }),
        keepalive: true,
      });
    } catch {}
    setFase("google");
    setVolvio(false);
    window.scrollTo(0, 0);
    if (localObj?.googleUrl) {
      // pestaña nueva para no perder esta pantalla; si el navegador la
      // bloquea (in-app), navegamos en la misma (sessionStorage nos trae de vuelta)
      const w = window.open(localObj.googleUrl, "_blank", "noopener");
      googleAbierto.current = Boolean(w);
      if (!w) window.location.href = localObj.googleUrl;
    }
  }

  function reabrirGoogle() {
    if (localObj?.googleUrl) window.open(localObj.googleUrl, "_blank", "noopener");
  }

  // Paso 3: canjear el descuento (después de Google)
  async function canjear() {
    if (!datosCompletos) return;
    setEnviando(true);
    setError("");
    try {
      const r = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          local,
          marca: marcaActiva,
          nombre: nombre.trim(),
          telefono: `549${telDigits}`,
          consent,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error || "No se pudo procesar.");
        return;
      }
      try {
        sessionStorage.removeItem(SS_KEY);
      } catch {}
      setCupon(j.codigo);
      setVence(j.vence || "");
      setFase("listo");
      window.scrollTo(0, 0);
    } catch {
      setError("Fallo de red. Reintentá.");
    } finally {
      setEnviando(false);
    }
  }

  // ---------- Pantalla final: cupón ----------
  if (fase === "listo") {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full text-3xl text-white" style={{ backgroundColor: color }}>
            ✓
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">¡Gracias por tu reseña en Google! 🎉</h1>
          <p className="mt-1 text-sm text-muted">Tu opinión ayuda a que más gente nos conozca.</p>

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

          <p className="mt-3 text-2xs text-faint">Sacale una captura al cupón así no lo perdés.</p>
        </div>
      </div>
    );
  }

  // ---------- Fase Google: la reseña se deja allá ----------
  if (fase === "google") {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full text-3xl" style={{ backgroundColor: "#fff", border: `3px solid ${color}` }}>
            ⭐
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {volvio ? "¡Listo tu descuento! 🎟️" : "Dejá tu reseña en Google"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {volvio
              ? "Tocá el botón para ver tu 15% OFF."
              : "Se abrió Google en otra pestaña para que dejes tu reseña de " + local + ". Cuando termines, volvé a esta pantalla y tu descuento se activa solo."}
          </p>

          {!volvio && (
            <div className="mt-5 rounded-card border border-line bg-surface p-5 text-left text-sm text-ink shadow-sm">
              <p className="font-semibold">Así de simple:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
                <li>Poné las estrellas en Google ({local}).</li>
                <li>Si querés, sumá un comentario o foto.</li>
                <li>Volvé a esta pantalla: tu 15% OFF te espera.</li>
              </ol>
            </div>
          )}

          {localObj?.googleUrl && !volvio && (
            <button
              onClick={reabrirGoogle}
              className="mt-4 w-full rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ borderColor: color, color }}
            >
              ⭐ Abrir Google de nuevo
            </button>
          )}

          {error && <p className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

          <button
            onClick={canjear}
            disabled={!volvio || enviando}
            className={`mt-3 w-full rounded-lg px-4 py-4 text-base font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${volvio && !enviando ? "animate-pulse shadow-lg" : ""}`}
            style={{ backgroundColor: color }}
          >
            {enviando
              ? "Generando tu cupón…"
              : volvio
                ? "🎟️ Ver mi 15% OFF"
                : "Esperando que vuelvas de Google…"}
          </button>
          <p className="mt-2 text-2xs text-faint">
            {volvio
              ? "Se activó solo al volver 🎉"
              : "En cuanto vuelvas de Google, el botón se enciende automáticamente."}
          </p>
        </div>
      </div>
    );
  }

  // ---------- Formulario (sin estrellas internas) ----------
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
            <p className="font-display text-xl font-bold leading-tight">📣 Tu reseña en Google vale 15% OFF</p>
            <p className="mt-1.5 text-sm text-white/90">
              Dejá tu reseña en <b>Google</b> y llevate un <b>15% de descuento</b> en tus <b>próximas 3 compras</b> en este local.
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

          {/* Botón: derecho a Google */}
          <button
            onClick={irAGoogle}
            disabled={!datosCompletos}
            className="mt-5 w-full rounded-lg px-4 py-4 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: color }}
          >
            {local ? `⭐ Calificar ${local} en Google` : "⭐ Calificar en Google"}
          </button>
          {!datosCompletos && (
            <p className="mt-2 text-center text-2xs text-faint">
              {!local ? "Elegí tu local para continuar." : "Completá tu nombre y WhatsApp."}
            </p>
          )}
          {datosCompletos && !localObj?.googleUrl && (
            <p className="mt-2 text-center text-2xs text-faint">
              Este local todavía no tiene link de Google: igual podés seguir y llevarte tu descuento.
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-2xs text-faint">DS Group · Gracias por tu visita</p>
      </div>
    </div>
  );
}
