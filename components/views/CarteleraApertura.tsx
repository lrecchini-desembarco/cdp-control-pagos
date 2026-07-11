"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { marcaAp, lf } from "@/lib/aperturas";

interface Item {
  id: string;
  nombre: string;
  marca: string;
  local: string;
  firma: string;
  actualizado: string;
}

const REFRESCO_MS = 15000; // se actualiza sola cada 15s
const W = 1920, H = 1080;  // stage fijo 16:9 (Full HD). La captura sale de acá.

// Logo real del header con fallback en cadena: /logos/<name>.svg -> .png -> texto.
// Los archivos van en public/logos/. Si no están, se ve el texto (como antes).
function Logo({ name, fallback }: { name: string; fallback: React.ReactNode }) {
  const [step, setStep] = useState(0); // 0=.svg · 1=.png · 2=texto
  if (step >= 2) return <>{fallback}</>;
  const src = step === 0 ? `/logos/${name}.svg` : `/logos/${name}.png`;
  return (
    // key -> remonta al cambiar de src para que onError vuelva a dispararse.
    // alt="" -> si falla no muestra texto roto (cae al fallback estilado).
    // eslint-disable-next-line @next/next/no-img-element
    <img key={src} src={src} alt="" onError={() => setStep((s) => s + 1)}
      style={{ height: "100%", width: "auto", maxWidth: "100%", objectFit: "contain" }} />
  );
}

export default function CarteleraApertura() {
  const [items, setItems] = useState<Item[]>([]);
  const [hora, setHora] = useState("");
  const [fs, setFs] = useState(false);
  const [scale, setScale] = useState(1);
  const [exportMode, setExportMode] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const limpio = exportMode || capturando; // oculta botones + reloj (para la imagen)

  // Modo captura limpia por ?export=1 (para screenshot manual/server-side).
  useEffect(() => {
    try { setExportMode(new URLSearchParams(window.location.search).get("export") === "1"); } catch {}
  }, []);

  // Escala el stage 1920×1080 para encajar en el viewport, sin scroll ni cortes.
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  function toggleFullscreen() {
    const d = document as any;
    if (!document.fullscreenElement) {
      const el = document.documentElement as any;
      (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen)?.call(document);
    }
  }
  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  async function cargar() {
    try {
      const j = await (await fetch("/api/aperturas", { cache: "no-store" })).json();
      if (j.ok) setItems(j.items);
      setHora(new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }));
    } catch {}
  }
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

  // Descarga el stage como PNG exacto: Full HD (1920×1080) o 4K (3840×2160).
  async function descargar(res: 1080 | 2160) {
    const node = stageRef.current;
    if (!node) return;
    setCapturando(true);
    try {
      await new Promise((r) => setTimeout(r, 80)); // deja que se oculten reloj/botones
      await (document as any).fonts?.ready?.catch?.(() => {});
      const { toPng } = await import("html-to-image");
      const url = await toPng(node, {
        width: W, height: H,
        pixelRatio: res / H, // 1080 -> 1x (1920×1080) · 2160 -> 2x (3840×2160)
        cacheBust: true,
        backgroundColor: "#ffffff",
        style: { transform: "none" }, // capturar sin la escala del viewport
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `apertura-locales-${res === 2160 ? "4k" : "fullhd"}.png`;
      a.click();
    } catch (e) {
      alert("No se pudo generar la imagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCapturando(false);
    }
  }

  const cols = useMemo(() => {
    const n = Math.min(4, Math.max(1, Math.ceil(items.length / 16)));
    const per = Math.ceil(items.length / n) || 1;
    return Array.from({ length: n }, (_, c) => items.slice(c * per, (c + 1) * per));
  }, [items]);

  const tot = useMemo(() => {
    const by = (m: string) => items.filter((i) => i.marca === m).length;
    return {
      total: items.length,
      tasty: by("tasty"),
      tastyMila: by("tasty-mila"),
      desembarco: by("desembarco"),
      mila: by("mila"),
      firmados: items.filter((i) => i.firma === "si").length,
      reservados: items.filter((i) => i.local === "reservado").length,
    };
  }, [items]);

  const Icono = ({ estado }: { estado: string }) => {
    const e = lf(estado);
    return <span style={{ color: e.color }} className="text-[1.15em] font-black leading-none">{e.icon}</span>;
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Controles: FUERA del stage, así nunca salen en la captura. Ocultos en modo limpio. */}
      {!limpio && (
        <div className="fixed right-3 top-3 z-50 flex items-center gap-2 print:hidden">
          <div className="flex items-center overflow-hidden rounded-lg border border-black/10 bg-white/90 shadow-sm backdrop-blur">
            <span className="px-2.5 text-xs font-semibold text-[#181818]">Descargar imagen para TV</span>
            <button onClick={() => descargar(1080)} title="1920×1080" className="border-l border-black/10 px-2.5 py-1.5 text-xs font-semibold text-[#181818] hover:bg-black/5">Full HD</button>
            <button onClick={() => descargar(2160)} title="3840×2160" className="border-l border-black/10 px-2.5 py-1.5 text-xs font-semibold text-[#181818] hover:bg-black/5">4K</button>
          </div>
          <button onClick={toggleFullscreen} title={fs ? "Salir" : "Pantalla completa"}
            className="rounded-lg border border-black/10 bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#181818] shadow-sm backdrop-blur hover:bg-black/5">
            {fs ? "🡼 Salir" : "⛶ Pantalla completa"}
          </button>
        </div>
      )}
      {capturando && (
        <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-1.5 text-xs font-semibold text-white">
          Generando imagen…
        </div>
      )}

      {/* Escalador: centra y encaja el stage 1920×1080 en el viewport (translate+scale,
          robusto en cualquier tamaño). La escala NO afecta la captura del stage. */}
      <div style={{ position: "absolute", top: "50%", left: "50%", width: W, height: H, transform: `translate(-50%,-50%) scale(${scale})`, transformOrigin: "center" }}>
        {/* STAGE fijo 1920×1080 — esto es lo que se captura */}
        <div ref={stageRef} style={{ width: W, height: H }} className="flex flex-col overflow-hidden bg-white text-[#181818]">
          {/* Banda superior */}
          <div className="w-full shrink-0" style={{ height: 12, background: "linear-gradient(90deg,#B5472E,#E0A024)" }} />

          {/* Marcas (logos reales; fallback a texto) */}
          <div className="flex shrink-0 items-center justify-around px-20" style={{ height: 104, paddingTop: 16, paddingBottom: 16 }}>
            <div className="flex h-full items-center justify-center" style={{ flex: 1 }}>
              <Logo name="mr-tasty"
                fallback={<span className="font-display text-4xl font-extrabold tracking-tight" style={{ color: "#E0A024" }}>Mr. <span className="italic">Tasty</span></span>} />
            </div>
            <div className="flex h-full items-center justify-center" style={{ flex: 1 }}>
              <Logo name="el-desembarco"
                fallback={<span className="font-display text-4xl font-black tracking-tight text-[#181818]">EL DESEMBARCO</span>} />
            </div>
            <div className="flex h-full items-center justify-center" style={{ flex: 1 }}>
              <Logo name="mila-go"
                fallback={<span className="font-display text-4xl font-black leading-none" style={{ color: "#B5472E" }}>MILA <span className="text-2xl align-middle">&</span> GO</span>} />
            </div>
          </div>

          {/* Título */}
          <div className="shrink-0 bg-[#111] py-3 text-center">
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.35em] text-white">Apertura de Locales</h1>
          </div>

          {/* Grilla — px generoso para overscan de TV */}
          <div className="flex flex-1 items-stretch gap-4 px-14 py-4">
            {cols.map((col, ci) => (
              <div key={ci} className="flex-1">
                <div className="grid grid-cols-[1fr_2.6rem_2.6rem_6rem] items-center rounded-t bg-[#E0A024] px-2.5 py-1.5 text-sm font-bold uppercase tracking-wide text-white">
                  <span>Sucursal</span><span className="text-center">L</span><span className="text-center">F</span><span className="text-center">Marca</span>
                </div>
                <div>
                  {col.map((it) => {
                    const m = marcaAp(it.marca);
                    return (
                      <div key={it.id} className="grid grid-cols-[1fr_2.6rem_2.6rem_6rem] items-center border-b border-white text-lg leading-tight">
                        <span className="truncate px-2.5 py-1 font-semibold uppercase" style={{ backgroundColor: m.filaBg }}>{it.nombre}</span>
                        <span className="grid place-items-center bg-[#F3F0E9] py-1"><Icono estado={it.local} /></span>
                        <span className="grid place-items-center bg-[#F3F0E9] py-1"><Icono estado={it.firma} /></span>
                        <span className="truncate px-1 py-1 text-center text-sm font-bold" style={{ backgroundColor: m.filaBg, color: m.color }}>{m.corto}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="flex shrink-0 items-stretch justify-center gap-8 px-14 py-2">
            <div className="rounded-xl border-2 border-[#E0A024] px-8 py-2 text-center">
              <p className="text-base font-semibold">Mr. Tasty <b className="ml-2 text-xl">{tot.tasty}</b></p>
              <p className="text-base font-semibold">Mr Tasty / Mila &amp; Go <b className="ml-2 text-xl">{tot.tastyMila}</b></p>
              {tot.desembarco > 0 && <p className="text-base font-semibold">Desembarco <b className="ml-2 text-xl">{tot.desembarco}</b></p>}
            </div>
            <div className="grid place-items-center rounded-xl border-2 border-[#E0A024] px-10">
              <p className="font-display text-xl font-bold uppercase">Total Locales <b className="ml-3 text-4xl">{tot.total}</b></p>
            </div>
            <div className="rounded-xl border-2 border-[#E0A024] px-8 py-2 text-center">
              <p className="text-base font-semibold">Locales Firmados <b className="ml-2 text-xl">{tot.firmados}</b></p>
              <p className="text-base font-semibold">Locales Reservados <b className="ml-2 text-xl">{tot.reservados}</b></p>
            </div>
          </div>

          {/* Referencias */}
          <div className="flex shrink-0 items-center justify-center gap-8 bg-[#111] py-3 text-sm font-medium text-white">
            <span style={{ color: "#2FA84F" }}>✓ <span className="text-white">Sí</span></span>
            <span style={{ color: "#D64541" }}>✗ <span className="text-white">No</span></span>
            <span style={{ color: "#E0A024" }}>! <span className="text-white">Reservado</span></span>
            <span className="ml-4 inline-flex items-center gap-1.5"><i className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: "#F7DFA0" }} /> Mr. Tasty</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: "#EFA6A2" }} /> Mr Tasty y Mila &amp; Go</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: "#F6C39B" }} /> Desembarco</span>
            {!limpio && <span className="ml-4 text-white/50">● en vivo · {hora}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
