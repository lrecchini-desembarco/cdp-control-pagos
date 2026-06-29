import ReviewPublic from "@/components/views/ReviewPublic";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reseñas · DS Group" };

// Página PÚBLICA (sin login): la abre el consumidor escaneando el QR.
export default function Page() {
  return <ReviewPublic />;
}
