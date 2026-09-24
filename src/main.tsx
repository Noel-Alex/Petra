import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { applyPetraVisualCssVariables } from "./design/visualTokens";
import "./ui/typography.css";
import "./app/app.css";
import "./app/visualTheme.css";

applyPetraVisualCssVariables(document.documentElement.style);

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Petra root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
