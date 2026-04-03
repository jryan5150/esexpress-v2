import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../tailwind.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="flex h-screen items-center justify-center bg-background text-on-surface">
      <h1 className="font-headline text-2xl font-bold">
        EsExpress Health Dashboard
      </h1>
    </div>
  </StrictMode>,
);
