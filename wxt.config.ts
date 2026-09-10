import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "wxt"

// Tiny API Hub — WXT 配置
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Tiny API Hub",
    description: "中转账号 + API 凭据管家",
    permissions: ["storage", "tabs", "alarms", "scripting", "activeTab"],
    host_permissions: ["<all_urls>"],
  },
})
