// Kelivo / CC Switch 导出。协议对齐旧仓 integrations/kelivo.ts + ccSwitch.ts。
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

export const KELIVO_PROVIDER_TYPES = {
  OpenAI: "openai",
  Claude: "claude",
  Google: "google",
} as const
export type KelivoProviderType =
  (typeof KELIVO_PROVIDER_TYPES)[keyof typeof KELIVO_PROVIDER_TYPES]

const KELIVO_SHARE_CODE_PREFIX = "ai-provider:v1:"
const KELIVO_GOOGLE_API_ORIGIN = "https://generativelanguage.googleapis.com"

export interface ExportInput {
  name: string
  baseUrl: string
  apiKey: string
  /** Kelivo 协议类型，默认 openai */
  kelivoType?: KelivoProviderType
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

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
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

/** 构建 Kelivo v1 导入码：`ai-provider:v1:<base64(utf8-json)>`。 */
export function buildKelivoShareCode(input: ExportInput): string {
  const name = input.name.trim()
  const apiKey = input.apiKey.trim()
  if (!name || !apiKey) throw new Error("需要名称和完整 API Key")

  const type = input.kelivoType ?? KELIVO_PROVIDER_TYPES.OpenAI
  const parsed = parseHttpBaseUrl(input.baseUrl)
  const payload: {
    type: KelivoProviderType
    name: string
    apiKey: string
    baseUrl?: string
  } = { type, name, apiKey }

  if (type === KELIVO_PROVIDER_TYPES.Google) {
    if (parsed.origin !== KELIVO_GOOGLE_API_ORIGIN) {
      throw new Error("Kelivo 不支持自定义 Google 端点")
    }
  } else {
    payload.baseUrl = coerceBaseUrlToV1(input.baseUrl)
  }

  return `${KELIVO_SHARE_CODE_PREFIX}${encodeUtf8Base64(JSON.stringify(payload))}`
}

export async function copyKelivoShareCode(input: ExportInput): Promise<string> {
  const code = buildKelivoShareCode(input)
  await navigator.clipboard.writeText(code)
  return code
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
