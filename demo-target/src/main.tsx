import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/antonio/500.css";
import "@fontsource/antonio/700.css";
import "@fontsource/saira/400.css";
import "@fontsource/saira/500.css";
import "@fontsource/jetbrains-mono/400.css";
import { App } from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Harborline root element was not found.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
