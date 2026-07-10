"use client";

import { createContext, useContext, useState } from "react";

// Estado del menú lateral en mobile (drawer). En desktop el sidebar es fijo y esto
// no se usa. Lo comparten el Topbar (botón hamburguesa) y el Sidebar (drawer).
const Ctx = createContext<{ abierto: boolean; setAbierto: (v: boolean) => void }>({
  abierto: false,
  setAbierto: () => {},
});

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return <Ctx.Provider value={{ abierto, setAbierto }}>{children}</Ctx.Provider>;
}

export const useMobileNav = () => useContext(Ctx);
