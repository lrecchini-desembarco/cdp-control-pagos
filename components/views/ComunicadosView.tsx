"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import assets from "@/lib/firma-assets.json";
import { Card, inputClass } from "@/components/ui/primitives";
import {
  construirEmailHTML,
  estadoBase,
  FOOTER_DEFAULT,
  MAILS_SUGERIDOS,
  type Estado,
} from "@/lib/comunicado-email";

// ============================================================================
// Presets de marca (logos base64 = los mismos que Firmas, de firma-assets.json).
// El logo final se resuelve por prioridad: URL > subido > este base64 > texto.
// ============================================================================
const LOGOS = assets.logos as Record<string, string>;

const MARCAS: Record<string, { label: string; color: string; logo: string }> = {
  desembarco: { label: "El Desembarco", color: "#C1121F", logo: LOGOS.desembarco ?? "" },
  tasty: { label: "Mr. Tasty", color: "#E4572E", logo: LOGOS.tasty ?? "" },
  mila: { label: "Mila & Go", color: "#E84A80", logo: LOGOS.milago ?? "" },
  ds: { label: "DS Group", color: "#155E63", logo: "" }, // sin logo -> texto de marca
};

const LS_KEY = "cdp_comunicados_v1";

function estadoInicial(): Estado {
  return {
    ...estadoBase,
    color: MARCAS.ds.color,
    ...FOOTER_DEFAULT,
  };
}

const logoDeMarca = (k: string) => MARCAS[k] ?? { logo: "", label: "" };

// ============================================================================
export default function ComunicadosView() {
  const [e, setE] = useState<Estado>(estadoInicial);
  const [copiado, setCopiado] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  // Cargar de localStorage (guard SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setE({ ...estadoInicial(), ...(JSON.parse(raw) as Estado) });
    } catch {}
  }, []);
  // Persistir.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(e));
    } catch {}
  }, [e]);

  const html = useMemo(() => construirEmailHTML(e, logoDeMarca(e.marca)), [e]);
  const set = (patch: Partial<Estado>) => setE((s) => ({ ...s, ...patch }));

  function elegirMarca(k: string) {
    const m = MARCAS[k];
    set({ marca: k, logoCustom: "", logoUrl: "", color: m.color });
  }

  function subirLogo(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ logoCustom: String(reader.result) });
    reader.readAsDataURL(file);
  }

  function flash(k: string) {
    setCopiado(k);
    setTimeout(() => setCopiado(""), 1600);
  }

  // Copiar con formato para pegar en Gmail: selección + execCommand, con fallback a ClipboardItem.
  async function copiarGmail() {
    const node = previewRef.current;
    if (node) {
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        sel?.removeAllRanges();
        sel?.addRange(range);
        const ok = document.execCommand("copy");
        sel?.removeAllRanges();
        if (ok) return flash("gmail");
      } catch {}
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([e.asunto], { type: "text/plain" }),
        }),
      ]);
      flash("gmail");
    } catch {}
  }
  function copiarHTML() {
    navigator.clipboard?.writeText(html).then(() => flash("html"));
  }
  function copiarAsunto() {
    navigator.clipboard?.writeText(e.asunto).then(() => flash("asunto"));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Comunicados</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Armá un email con la identidad de la marca, editá encabezado y pie, y copialo con formato para pegar en Gmail.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ---------------- Formulario ---------------- */}
        <div className="space-y-4">
          {/* Encabezado / marca */}
          <Card className="space-y-3 p-4">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Encabezado</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MARCAS).map(([k, m]) => (
                <button
                  key={k}
                  onClick={() => elegirMarca(k)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    e.marca === k && !e.logoCustom && !e.logoUrl
                      ? "border-action bg-action/10 text-action"
                      : "border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action">
                Subir logo
                <input type="file" accept="image/*" className="hidden" onChange={(ev) => subirLogo(ev.target.files?.[0])} />
              </label>
              {e.logoCustom && (
                <button onClick={() => set({ logoCustom: "" })} className="text-2xs text-faint underline">
                  quitar logo subido
                </button>
              )}
              <label className="flex items-center gap-2 text-2xs text-faint">
                Color de acento
                <input
                  type="color"
                  value={e.color}
                  onChange={(ev) => set({ color: ev.target.value })}
                  className="h-7 w-9 cursor-pointer rounded border border-line bg-surface"
                />
              </label>
            </div>
            <div>
              <span className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-faint">
                Logo por URL (opcional · recomendado para emails)
              </span>
              <input
                className={inputClass}
                placeholder="https://…/logo.png"
                value={e.logoUrl}
                onChange={(ev) => set({ logoUrl: ev.target.value })}
              />
              <p className="mt-1 text-2xs text-faint">
                Los presets usan el logo base64 (igual que Firmas). Al pegar en Gmail suele funcionar, pero si algún
                cliente no muestra la imagen, cargá acá una <b>URL hospedada</b> y el email la usa.
              </p>
            </div>
            <Campo label="Etiqueta lateral (opcional)" value={e.etiquetaLateral} onChange={(v) => set({ etiquetaLateral: v })} />
          </Card>

          {/* Contenido */}
          <Card className="space-y-3 p-4">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Contenido</p>
            <div>
              <span className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-faint">Asunto</span>
              <div className="flex gap-2">
                <input className={inputClass} value={e.asunto} onChange={(ev) => set({ asunto: ev.target.value })} />
                <button
                  onClick={copiarAsunto}
                  title="En Gmail el asunto va en otro campo"
                  className="shrink-0 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:border-action/40 hover:text-action"
                >
                  {copiado === "asunto" ? "✓" : "Copiar"}
                </button>
              </div>
            </div>
            <Campo label="Etiqueta (eyebrow)" value={e.eyebrow} onChange={(v) => set({ eyebrow: v })} />
            <Campo label="Título" value={e.titulo} onChange={(v) => set({ titulo: v })} />
            <Campo label="Saludo" value={e.saludo} onChange={(v) => set({ saludo: v })} />
            <label className="block">
              <span className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-faint">Cuerpo (un párrafo por línea)</span>
              <textarea
                className={`${inputClass} h-28 resize-y`}
                value={e.cuerpo}
                onChange={(ev) => set({ cuerpo: ev.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Botón (texto)" value={e.botonTexto} onChange={(v) => set({ botonTexto: v })} />
              <Campo label="Botón (link)" value={e.botonLink} onChange={(v) => set({ botonLink: v })} />
            </div>
          </Card>

          {/* Pie */}
          <Card className="space-y-3 p-4">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Pie</p>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Grupo" value={e.grupo} onChange={(v) => set({ grupo: v })} />
              <Campo label="Línea de marcas" value={e.marcasLinea} onChange={(v) => set({ marcasLinea: v })} />
              <Campo label="Área / firma" value={e.area} onChange={(v) => set({ area: v })} />
              <div>
                <span className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-faint">Email de contacto</span>
                <input className={inputClass} list="mails-sugeridos" value={e.email} onChange={(ev) => set({ email: ev.target.value })} />
                <datalist id="mails-sugeridos">
                  {MAILS_SUGERIDOS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <Campo label="Sitio web" value={e.web} onChange={(v) => set({ web: v })} />
              <Campo label="Ubicación" value={e.ubicacion} onChange={(v) => set({ ubicacion: v })} />
            </div>
            <Campo label="Línea legal" value={e.legal} onChange={(v) => set({ legal: v })} />
          </Card>
        </div>

        {/* ---------------- Preview + acciones ---------------- */}
        <div className="space-y-3">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-2xs font-medium uppercase tracking-wide text-faint">Preview</p>
              <div className="flex flex-wrap gap-2">
                <Accion primary onClick={copiarGmail}>{copiado === "gmail" ? "✓ copiado" : "Copiar para Gmail"}</Accion>
                <Accion onClick={copiarHTML}>{copiado === "html" ? "✓ copiado" : "Copiar HTML"}</Accion>
                <Accion onClick={() => setE(estadoInicial())}>Restablecer</Accion>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <div ref={previewRef} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
            <p className="text-2xs text-faint">
              “Copiar para Gmail” pega el email con formato en el cuerpo del mail. El <b>asunto</b> se copia aparte
              (en Gmail va en otro campo).
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-2xs font-medium uppercase tracking-wide text-faint">{label}</span>
      <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Accion({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
        primary
          ? "bg-action text-white hover:bg-action-700"
          : "border border-line bg-surface text-ink hover:border-action/40 hover:text-action"
      }`}
    >
      {children}
    </button>
  );
}
