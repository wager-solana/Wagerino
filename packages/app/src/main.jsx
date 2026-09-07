import "./polyfill.js";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./app.css";
window.addEventListener("error", (e) => fatal(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => fatal(e.reason));
function fatal(err) { const el = document.getElementById("root"); if (el && !el.childElementCount) el.innerHTML = '<pre style="color:#ff7b7b;padding:24px;white-space:pre-wrap;font-family:monospace">app error:\n' + String(err && err.stack || err) + "</pre>"; }
createRoot(document.getElementById("root")).render(<App />);
