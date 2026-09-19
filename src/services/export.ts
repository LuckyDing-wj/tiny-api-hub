// CC Switch 导出。协议对齐旧仓 integrations/ccSwitch.ts。
// Kelivo 已按需求砍掉（REQUIREMENTS 3.6），不保留其协议代码。
// 不搬 toast/i18n 依赖，错误用 throw。

export const CCSWITCH_APPS = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "hermes",
  "opencode",
  "openclaw",
] as const
export type CCSwitchApp = (typeof CCSWITCH_APPS)[number]

export interface ExportInput {
  name: string
  baseUrl: string
  apiKey: string
  /** CC Switch 目标 app */
  ccSwitchApp?: CCSwitchApp
  model?: string
  notes?: string
}

function parseHttpBaseUrl(baseUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(baseUrl.trim())
  } catch {
    throw new Error("Base URL 无效")
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Base URL 必须是 http/https，不含凭证、query、fragment")
  }
  return parsed
}

function coerceBaseUrlToV1(baseUrl: string): string {
  const parsed = parseHttpBaseUrl(baseUrl)
  const path = parsed.pathname.replace(/\/+$/, "")
  if (path === "" || path === "/") {
    parsed.pathname = "/v1"
  } else if (!path.endsWith("/v1")) {
    parsed.pathname = `${path}/v1`
  }
  return parsed.toString().replace(/\/$/, "")
}

function toHermesProviderSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** 构建 CC Switch deeplink：`ccswitch://v1/import?...`。 */
export function buildCCSwitchUrl(input: ExportInput): string {
  const app = input.ccSwitchApp ?? "claude"
  if (!CCSWITCH_APPS.includes(app)) throw new Error(`不支持的 CC Switch app: ${app}`)

  const name = input.name.trim()
  const apiKey = input.apiKey.trim()
  if (!name || !apiKey) throw new Error("需要名称和完整 API Key")

  const endpoint = coerceBaseUrlToV1(input.baseUrl)
  const homepage = parseHttpBaseUrl(input.baseUrl).origin
  const providerName =
    app === "hermes"
      ? toHermesProviderSlug(name) ||
        toHermesProviderSlug(new URL(endpoint).hostname) ||
        "provider"
      : name

  const params = new URLSearchParams()
  params.set("resource", "provider")
  params.set("app", app)
  params.set("name", providerName)
  params.set("homepage", homepage)
  params.set("endpoint", endpoint)
  params.set("apiKey", apiKey)
  if (input.model) params.set("model", input.model)
  if (input.notes) params.set("notes", input.notes)

  return `ccswitch://v1/import?${params.toString()}`
}

export function openInCCSwitch(input: ExportInput): string {
  const url = buildCCSwitchUrl(input)
  const a = document.createElement("a")
  a.href = url
  a.rel = "noreferrer"
  document.body.appendChild(a)
  a.click()
  a.remove()
  return url
}
