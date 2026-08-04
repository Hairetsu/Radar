import React from "react";
import ReactDOM from "react-dom/client";
import { applyTheme, readStoredTheme } from "./lib/theme";
import { App } from "./App";
import { AiOperatorApp } from "./ai-operator/AiOperatorApp";
import { RendererBootstrapError } from "./RendererBootstrapError";
import "./styles.css";

applyTheme(readStoredTheme());

const requestedSurface = window.location.search
  .slice(1)
  .split("&")
  .map((part) => part.split("="))
  .find(([key]) => key === "surface")?.[1] || "workspace";
const exposedSurface = window.radarSurface || (window.radar ? "workspace" : null);
const surfaceMatches = requestedSurface === exposedSurface;

const root = surfaceMatches
  ? exposedSurface === "ai-operator"
    ? <AiOperatorApp />
    : <App />
  : <RendererBootstrapError message={`Requested ${requestedSurface}; preload exposed ${exposedSurface || "no role"}.`} />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {root}
  </React.StrictMode>
);
