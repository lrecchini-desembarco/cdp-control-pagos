import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import EstadoSeccion from "@/components/layout/EstadoSeccion";
import { MobileNavProvider } from "@/components/layout/MobileNav";
import { PrivacidadProvider } from "@/components/layout/Privacidad";
import { TemaProvider } from "@/components/layout/Tema";
import { getSesion } from "@/lib/session";
import { ROLES, NAV_CATALOG, puedeVerNav, homeDeNav, visiblePara, NAV_POR_EMAIL } from "@/lib/roles";
import { getRolesNav, blindar } from "@/lib/roles-store";
import { googlePlacesConfigurado } from "@/lib/google-places";
import { puedeVerPanelSistemas } from "@/lib/panel-sistemas-store";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "CDP · Control — DS Group",
  description: "Comparativa de pedidos al CDP contra ventas de sucursal",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  const pathname = headers().get("x-pathname") ?? "";
  const segs = pathname.split("/").filter(Boolean);
  const ruta = pathname === "/" ? "/" : "/" + (segs[0] ?? "");
  // Los tutoriales se gatean por la subruta específica (tango/ayres/...), no solo por
  // el padre "/tutoriales", así un rol restringido no entra a los que no le tocan.
  const rutaGate = ruta === "/tutoriales" && segs[1] ? `/tutoriales/${segs[1]}` : ruta;
  const enOnboarding = ruta === "/franquiciado";

  // Pantallas de TV: tablero puro, SIN menú lateral ni barra superior (aunque haya sesión).
  const esPantallaTv = ruta === "/tv" || ruta === "/cartelera";
  // Panel de Sistemas es una consola aparte: chrome propio (barra de título +
  // riel + ⌘K, ver app/panel-sistemas/layout.tsx), no el Sidebar/Topbar del
  // CDP. El gate de acceso (puedeVerPanelSistemas) sigue viviendo ahí, sin
  // cambios — esto solo decide qué shell envuelve a `children`.
  const esPanelSistemas = ruta === "/panel-sistemas";

  // Nav del usuario: si tiene nav propio (elegido en Usuarios) lo usa; si no, el del rol.
  const navByRol = sesion ? await getRolesNav() : null;
  const miNav = sesion
    ? sesion.nav
      ? blindar(sesion.rol, sesion.nav)
      : navByRol?.[sesion.rol] ?? []
    : [];
  // Gating: las pantallas de lista blanca (Credenciales) no dependen del rol sino
  // del email; el resto, del nav del usuario. Si no puede, va a su home (las TV se saltan).
  const porEmail = visiblePara(NAV_CATALOG, sesion?.email).filter((i) => i.soloEmails).map((i) => i.href);
  const puedeEntrar = (r: string) => (NAV_POR_EMAIL.includes(r) ? porEmail.includes(r) : puedeVerNav(miNav, r));
  // Onboarding del franquiciado: sin perfil (puesto) va a completarlo; con perfil, o si
  // no es franquiciado, no puede quedarse en esa pantalla.
  if (sesion && !esPantallaTv) {
    if (sesion.rol === "franquiciado" && !sesion.puesto && !enOnboarding) redirect("/franquiciado");
    if (enOnboarding && (sesion.rol !== "franquiciado" || sesion.puesto)) redirect(homeDeNav(miNav));
  }
  // /panel-sistemas (y todo lo que cuelga debajo, ej. /panel-sistemas/usuarios:
  // rutaGate solo mira el primer segmento) no es un ítem del nav —no vive en el
  // sidebar, solo en el botón del topbar— y su acceso es la lista dinámica de
  // lib/panel-sistemas-store.ts, no el nav/rol de acá arriba. Las rutas viejas
  // (/usuarios, /credenciales, /estado, /ip-libres, /inventario) ya no están en
  // ningún nav —se mudaron adentro del panel— pero se dejan como redirects hacia
  // la nueva ubicación para no romper links guardados; también se exceptúan, así
  // el redirect se ejecuta en vez de rebotar antes de llegar a la página.
  const EXCEPTUADAS_DEL_GATING_NAV = ["/panel-sistemas", "/usuarios", "/credenciales", "/estado", "/ip-libres", "/inventario"];
  if (
    sesion &&
    pathname &&
    !esPantallaTv &&
    !enOnboarding &&
    !EXCEPTUADAS_DEL_GATING_NAV.includes(rutaGate) &&
    !puedeEntrar(rutaGate)
  ) {
    redirect(homeDeNav(miNav));
  }
  // Items del menú que ve este rol (con su ícono/label del catálogo). Si Google
  // Places está configurado, Reseñas deja de ser "revisar" (foto) y pasa a "en vivo".
  const placesOn = googlePlacesConfigurado();
  const panelSistemasPermitido = await puedeVerPanelSistemas(sesion?.email);
  // visiblePara: saca las pantallas de lista blanca (ej. Credenciales) si este
  // usuario no está en ellas. No las ve ni el admin. La página y su API lo
  // vuelven a chequear igual: esto es solo el menú.
  const itemsNav = visiblePara(NAV_CATALOG, sesion?.email)
    .filter((i) => puedeEntrar(i.href))
    .map((i) => (placesOn && i.href === "/resenas" ? { ...i, fresh: "vivo" as const } : i));

  const body = (
    <html lang="es" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans">
        {/* Anti-flash: aplica el modo privacidad ANTES de pintar (evita mostrar los montos por un frame). */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('cdp_privacy')==='1')document.documentElement.dataset.privacy='on'}catch(e){}` }} />
        {/* Modo oscuro: cualquier cuenta puede elegirlo. Default claro (si no hay
            nada guardado, no se toca el atributo y queda el tema claro de siempre). */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('cdp_theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}` }} />
        {sesion && !esPantallaTv && !enOnboarding && !esPanelSistemas ? (
          <PrivacidadProvider>
            <TemaProvider>
              <MobileNavProvider>
                <div className="flex h-screen overflow-hidden">
                  <Sidebar rol={sesion.rol} items={itemsNav} />
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <Topbar email={sesion.email} rolLabel={ROLES[sesion.rol].label} panelSistemasPermitido={panelSistemasPermitido} />
                    <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
                      <EstadoSeccion />
                      {children}
                    </main>
                  </div>
                </div>
              </MobileNavProvider>
            </TemaProvider>
          </PrivacidadProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
  return body;
}
