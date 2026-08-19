import EstadoView from "@/components/views/EstadoView";

// El layout del panel ya filtró por la lista blanca; la API de /estado
// también exige admin por su cuenta.
export default function Page() {
  return <EstadoView />;
}
