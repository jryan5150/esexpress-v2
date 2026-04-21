import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../tailwind.css";
import { App } from "./app";
import { initSentry } from "./lib/sentry";

const sentryOn = initSentry();
if (sentryOn) console.log("[ESX] Sentry enabled");

console.log("[ESX] main.tsx loaded, mounting React...");

const root = document.getElementById("root");
if (!root) {
  console.error("[ESX] FATAL: #root element not found");
} else {
  try {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    console.log("[ESX] React mounted successfully");
  } catch (err) {
    console.error("[ESX] React mount failed:", err);
    root.innerHTML = `<div style="color:red;padding:2rem;font-family:monospace">React crashed: ${err}</div>`;
  }
}
