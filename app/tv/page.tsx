import CarteleraApertura from "@/components/views/CarteleraApertura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apertura de Locales · DS Group" };

// Alias corto de /cartelera para tipear fácil en la TV. Público (sin login).
export default function Page() {
  return <CarteleraApertura />;
}
