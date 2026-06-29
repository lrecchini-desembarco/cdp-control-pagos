import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
