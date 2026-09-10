import { loadAccounts } from "~/services/storage"
import { NewApiError } from "~/services/newApi"
import {
  calculateModelPrice,
  resolveDisplayPrice,
} from "~/services/modelPricing"
import {
  isTokenBillingType,
  type ModelPricing,
  type PricingResponse,
} from "~/services/pricingModel"
import type { Account } from "~/types"

export interface ModelInfo {
  id: string
  name: string
  /** 输入价格 USD（token 计费 = per 1M tokens；按次 = per call） */
  inputPrice?: number
  /** 输出价格 USD */
  outputPrice?: number
  /** 缓存读倍率（相对输入价） */
  cacheRead?: number
  /** 厂商 */
  vendor?: string
  /** 计费模式 */
  billingMode?: "token" | "per-call"
  /** 支持的端点类型 */
  supportedEndpointTypes?: string[]
}

export interface AccountModels {
  accountId: string
  accountName: string
  models: ModelInfo[]
}

async function getAccount(id: string): Promise<Account> {
  const accounts = await loadAccounts()
  const account = accounts.find((a) => a.id === id)
  if (!account) throw new Error("账号不存在")
  return account
}

function buildHeaders(accessToken: string, userId?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "New-API-User": userId ?? "",
    Authorization: `Bearer ${accessToken}`,
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const origin = baseUrl.replace(/\/+$/, "")
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${origin}${suffix}`
}

async function decodeError(res: Response): Promise<never> {
  let message = res.statusText || `HTTP ${res.status}`
  let code: string | number | undefined
  try {
    const body = (await res.json()) as Record<string, unknown>
    if (typeof body.message === "string") message = body.message
    if (typeof body.code === "number") code = body.code
    else if (typeof body.code === "string" && body.code) code = body.code
  } catch {
    // 非 JSON
  }
  throw new NewApiError(message, res.status, code)
}

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as Record<string, unknown>).data as T
  }
  return body as T
}

/** GET /api/user/models — 账号可用模型名列表。 */
async function fetchUserModels(
  account: Account,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch(joinUrl(account.baseUrl, "/api/user/models"), {
    method: "GET",
    headers: buildHeaders(account.accessToken, account.userId),
    credentials: "omit",
    cache: "no-store",
    signal,
  })
  if (!res.ok) await decodeError(res)
  const body = await res.json()
  const data = unwrap<string[] | string>(body)
  if (Array.isArray(data)) return data.filter((m) => typeof m === "string")
  if (typeof data === "string") {
    return data
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/** GET /api/pricing — 站点价格表（公开）。 */
export async function fetchPricing(
  account: Account,
  signal?: AbortSignal,
): Promise<PricingResponse | null> {
  try {
    const res = await fetch(joinUrl(account.baseUrl, "/api/pricing"), {
      method: "GET",
      headers: buildHeaders(account.accessToken, account.userId),
      credentials: "omit",
      cache: "no-store",
      signal,
    })
    if (!res.ok) await decodeError(res)
    const body = await res.json()
    // 裸数组：当作 data
    if (Array.isArray(body)) {
      return { data: body as ModelPricing[], group_ratio: {}, success: true }
    }
    const envelope = unwrap<PricingResponse | ModelPricing[]>(body)
    if (Array.isArray(envelope)) {
      return { data: envelope, group_ratio: {}, success: true }
    }
    return envelope
  } catch (err) {
    console.warn("[tiny-api-hub] /api/pricing failed", err)
    return null
  }
}

function resolveGroupMultiplier(groupRatio: unknown): number {
  if (groupRatio && typeof groupRatio === "object") {
    const obj = groupRatio as Record<string, unknown>
    const def = obj.default
    if (typeof def === "number" && Number.isFinite(def) && def >= 0) {
      return def
    }
  }
  if (typeof groupRatio === "number" && Number.isFinite(groupRatio)) {
    return groupRatio
  }
  return 1
}

/** 拉某账号模型 + 价格，合并返回。 */
export async function getAccountModels(
  accountId: string,
): Promise<AccountModels> {
  const account = await getAccount(accountId)
  if (account.siteType !== "new-api") {
    throw new Error(`仅支持 New API 站点，收到：${account.siteType}`)
  }

  const [names, pricing] = await Promise.all([
    fetchUserModels(account),
    fetchPricing(account),
  ])

  const groupMultiplier = resolveGroupMultiplier(pricing?.group_ratio)

  const vendorMap = new Map<number, string>()
  if (pricing?.vendors) {
    for (const v of pricing.vendors) {
      if (typeof v.id === "number" && typeof v.name === "string") {
        vendorMap.set(v.id, v.name)
      }
    }
  }

  // pricing data 按模型名建索引（大小写不敏感）
  const priceByName = new Map<string, ModelPricing>()
  if (pricing?.data) {
    for (const row of pricing.data) {
      if (row.model_name) {
        priceByName.set(row.model_name.toLowerCase(), row)
      }
    }
  }

  const models: ModelInfo[] = names.map((name) => {
    const row = priceByName.get(name.toLowerCase())
    if (!row) {
      return { id: name, name }
    }
    const calc = calculateModelPrice(row, groupMultiplier)
    const display = resolveDisplayPrice(calc)
    return {
      id: name,
      name,
      inputPrice: display.input,
      outputPrice: display.output,
      cacheRead: calc.kind === "token" ? calc.usdPerMillionTokens.cacheRead : undefined,
      vendor: row.vendor_id != null ? vendorMap.get(row.vendor_id) : undefined,
      billingMode: display.billingMode,
      supportedEndpointTypes: row.supported_endpoint_types,
    }
  })

  return {
    accountId: account.id,
    accountName: account.name,
    models,
  }
}

/** 跨账号比价：同一模型名在不同账号的价格。 */
export async function compareModelPrices(
  modelNames: string[],
): Promise<
  Map<
    string,
    Array<{ accountId: string; accountName: string; model?: ModelInfo }>
  >
> {
  const accounts = await loadAccounts()
  const enabled = accounts.filter(
    (a) => !a.disabled && a.siteType === "new-api",
  )
  const perAccount = await Promise.all(
    enabled.map((a) => getAccountModels(a.id).catch(() => null)),
  )

  const result = new Map<
    string,
    Array<{ accountId: string; accountName: string; model?: ModelInfo }>
  >()
  for (const name of modelNames) result.set(name, [])
  for (const am of perAccount) {
    if (!am) continue
    const byName = new Map(am.models.map((m) => [m.name, m]))
    for (const name of modelNames) {
      result.get(name)?.push({
        accountId: am.accountId,
        accountName: am.accountName,
        model: byName.get(name),
      })
    }
  }
  return result
}

/** 某分组可用的模型名列表（从 pricing 的 enable_groups 反查）。 */
export async function listGroupModels(
  accountId: string,
  groupName: string,
): Promise<string[]> {
  const account = await getAccount(accountId)
  if (account.siteType !== "new-api") {
    throw new Error(`仅支持 New API 站点，收到：${account.siteType}`)
  }
  const pricing = await fetchPricing(account)
  if (!pricing?.data) return []
  return pricing.data
    .filter((m) => Array.isArray(m.enable_groups) && m.enable_groups.includes(groupName))
    .map((m) => m.model_name)
    .filter(Boolean)
}

export { isTokenBillingType }
