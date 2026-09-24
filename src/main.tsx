import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./ui/typography.css";
import "./app/app.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Petra root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
