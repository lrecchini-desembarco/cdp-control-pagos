import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import EstadoSeccion from "@/components/layout/EstadoSeccion";
import { getSesion } from "@/lib/session";
import { ROLES, NAV_CATALOG, puedeVerNav, homeDeNav } from "@/lib/roles";
import { getRolesNav } from "@/lib/roles-store";

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
  const ruta = pathname === "/" ? "/" : "/" + (pathname.split("/").filter(Boolean)[0] ?? "");

  // Pantallas de TV: tablero puro, SIN menú lateral ni barra superior (aunque haya sesión).
  const esPantallaTv = ruta === "/tv" || ruta === "/cartelera";

  // Nav por rol: editable desde /usuarios, persistido en el store.
  const navByRol = sesion ? await getRolesNav() : null;
  const miNav = navByRol && sesion ? navByRol[sesion.rol] ?? [] : [];
  // Gating por rol: si el rol no puede ver esta ruta, lo mandamos a su home (las TV se saltan).
  if (sesion && pathname && !esPantallaTv && !puedeVerNav(miNav, ruta)) {
    redirect(homeDeNav(miNav));
  }
  // Items del menú que ve este rol (con su ícono/label del catálogo).
  const itemsNav = NAV_CATALOG.filter((i) => puedeVerNav(miNav, i.href));

  const body = (
    <html lang="es" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans">
        {sesion && !esPantallaTv ? (
          <div className="flex h-screen overflow-hidden">
            <Sidebar rol={sesion.rol} items={itemsNav} />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Topbar email={sesion.email} rolLabel={ROLES[sesion.rol].label} />
              <main className="flex-1 overflow-y-auto px-6 py-6">
                <EstadoSeccion />
                {children}
              </main>
            </div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
  return body;
}
