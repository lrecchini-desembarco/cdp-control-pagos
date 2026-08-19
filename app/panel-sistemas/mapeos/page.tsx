import MapeosView from "@/components/views/MapeosView";

// Mismo contenido que /mapeos (Operaciones también lo usa y sigue entrando
// por ahí); esto es solo un acceso rápido para no salir del panel. El gate
// real es el de app/panel-sistemas/layout.tsx.
export default function Page() {
  return <MapeosView />;
}
