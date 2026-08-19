import PanelSistemasView from "@/components/views/PanelSistemasView";

// El acceso ya lo chequea app/panel-sistemas/layout.tsx (gate único para todo
// lo que cuelga de /panel-sistemas/*).
export default function Page() {
  return <PanelSistemasView />;
}
