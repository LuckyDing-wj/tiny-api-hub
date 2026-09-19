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
    // alarms/activeTab 已删：定时同步与通知确认不做，activeTab 被 <all_urls> 覆盖
    permissions: ["storage", "tabs", "scripting"],
    host_permissions: ["<all_urls>"],
  },
})
