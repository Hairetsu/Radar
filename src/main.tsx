import React from "react";
import ReactDOM from "react-dom/client";
import { applyTheme, readStoredTheme } from "./lib/theme";
import { App } from "./App";
import "./styles.css";

applyTheme(readStoredTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
