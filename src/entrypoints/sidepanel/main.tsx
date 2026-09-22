import React from "react"
import { createRoot } from "react-dom/client"

import App from "~/entrypoints/popup/App"
import "~/styles/tailwind.css"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("sidepanel root not found")

createRoot(rootElement).render(
  <React.StrictMode>
    <App layout="sidepanel" />
  </React.StrictMode>,
)
