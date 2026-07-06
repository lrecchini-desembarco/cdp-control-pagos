import CarteleraApertura from "@/components/views/CarteleraApertura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apertura de Locales · DS Group" };

// Página PÚBLICA (sin login): se abre en la TV. Se actualiza sola.
export default function Page() {
  return <CarteleraApertura />;
}
