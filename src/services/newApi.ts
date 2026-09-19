// New API family 协议客户端（新写，对照旧仓 /api/user/self 行为）。
// 参考：旧仓 src/services/apiService/newApiFamily/default/accountData.ts 只读对齐。
// 不拷旧仓文件。
// 所有站点请求走 siteFetch：直连被 CF 盾拦时自动改走临时页过盾。

import { siteFetch } from "~/services/siteFetch"

const QUOTA_PER_USD = 500000
export { QUOTA_PER_USD }

export interface NewApiUserSelf {
  id?: number | string
  username?: string
  quota?: number
  used_quota?: number
  access_token?: string
  display_token?: boolean
}

export interface NewApiAccountSnapshot {
  userId: string
  username: string
  quota: number
  balance: number
  accessToken: string
  siteName?: string
}

export interface NewApiToken {
  id: number
  user_id: number
  key: string
  status: number
  name: string
  note?: string
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  used_quota: number
  unlimited_quota: boolean
  model_limits_enabled?: boolean
  model_limits?: string
  allow_ips?: string
  group?: string
}

export interface NewApiTokenInput {
  name: string
  remain_quota?: number
  unlimited_quota?: boolean
  expired_time?: number
  model_limits_enabled?: boolean
  model_limits?: string
  allow_ips?: string
  group?: string
}

export interface NewApiUserGroup {
  group?: string
  ratio?: number | string
  models?: string
  description?: string
}

// 以下请求原语供协议族各客户端（models/verify 等）复用，勿在本文件外重写。
export function buildHeaders(accessToken: string, userId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "New-API-User": userId ?? "",
    Authorization: `Bearer ${accessToken}`,
  }
  return headers
}

export function joinUrl(baseUrl: string, path: string): string {
  const origin = baseUrl.replace(/\/+$/, "")
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${origin}${suffix}`
}

export class NewApiError extends Error {
  readonly status: number
  readonly code?: string | number
  constructor(message: string, status: number, code?: string | number) {
    super(message)
    this.name = "NewApiError"
    this.status = status
    this.code = code
  }
}

export async function decodeError(res: Response): Promise<never> {
  let message = res.statusText || `HTTP ${res.status}`
  let code: string | number | undefined
  try {
    const body = (await res.json()) as Record<string, unknown>
    if (typeof body.message === "string" && body.message) {
      message = body.message
    }
    if (typeof body.code === "number") {
      code = body.code
    } else if (typeof body.code === "string" && body.code) {
      code = body.code
    }
    if (body.success === false && typeof body.message === "string") {
      message = body.message
    }
  } catch {
    // 非 JSON 体，保留 statusText
  }
  throw new NewApiError(message, res.status, code)
}

export function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as Record<string, unknown>).data as T
  }
  return body as T
}

/** GET /api/user/self — 返回当前用户信息含 quota。 */
export async function fetchUserSelf(
  baseUrl: string,
  accessToken: string,
  userId?: string,
  signal?: AbortSignal,
): Promise<NewApiUserSelf> {
  const res = await siteFetch(joinUrl(baseUrl, "/api/user/self"), {
    method: "GET",
    headers: buildHeaders(accessToken, userId),
    signal,
  })
  if (!res.ok) await decodeError(res)
  const body = await res.json()
  return unwrap<NewApiUserSelf>(body)
}

export function quotaToBalance(quota: number): number {
  if (!Number.isFinite(quota) || quota <= 0) return 0
  return quota / QUOTA_PER_USD
}

/** GET /api/status — 公开站点信息，含 system_name。 */
export async function fetchSiteStatus(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<{ system_name?: string } | null> {
  try {
    const res = await siteFetch(joinUrl(baseUrl, "/api/status"), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    })
    if (!res.ok) return null
    const body = await res.json()
    return unwrap<{ system_name?: string }>(body)
  } catch {
    return null
  }
}

function hostnameFallback(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, "")
    const parts = host.split(".")
    const label = parts.length >= 2 ? parts[parts.length - 2] : host
    return label.charAt(0).toUpperCase() + label.slice(1)
  } catch {
    return baseUrl
  }
}

/** 拉一次账号快照：quota + balance + 站点名。 */
export async function refreshNewApiAccount(
  baseUrl: string,
  accessToken: string,
  userId?: string,
  signal?: AbortSignal,
): Promise<NewApiAccountSnapshot> {
  const [user, status] = await Promise.all([
    fetchUserSelf(baseUrl, accessToken, userId, signal),
    fetchSiteStatus(baseUrl, signal),
  ])
  const quota = user.quota ?? 0
  const siteName = status?.system_name?.trim() || hostnameFallback(baseUrl)
  return {
    userId: user.id != null ? String(user.id) : (userId ?? ""),
    username: user.username ?? "",
    quota,
    balance: quotaToBalance(quota),
    accessToken: user.access_token || accessToken,
    siteName,
  }
}

/** 当前用户可用分组。GET /api/user/self/groups → { default: {group, ratio, models?} } */
export async function fetchUserGroups(
  baseUrl: string,
  accessToken: string,
  userId?: string,
  signal?: AbortSignal,
): Promise<Record<string, NewApiUserGroup>> {
  const res = await siteFetch(joinUrl(baseUrl, "/api/user/self/groups"), {
    method: "GET",
    headers: buildHeaders(accessToken, userId),
    signal,
  })
  if (!res.ok) await decodeError(res)
  const body = await res.json()
  return unwrap<Record<string, NewApiUserGroup>>(body)
}

/** 站点全部分组名。GET /api/group → string[] */
export async function fetchSiteGroups(
  baseUrl: string,
  accessToken: string,
  userId?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await siteFetch(joinUrl(baseUrl, "/api/group"), {
    method: "GET",
    headers: buildHeaders(accessToken, userId),
    signal,
  })
  if (!res.ok) await decodeError(res)
  const body = await res.json()
  const data = unwrap<string[] | string[]>(body)
  return Array.isArray(data) ? data : []
}

/** 列出账号下所有 Token。GET /api/token/?p=N&size=M */
export async function fetchTokens(
  baseUrl: string,
  accessToken: string,
  userId?: string,
  signal?: AbortSignal,
): Promise<NewApiToken[]> {
  const all: NewApiToken[] = []
  let page = 1
  const pageSize = 100
  // 安全上限，防异常站点死循环
  for (let i = 0; i < 100; i++) {
    const params = new URLSearchParams({
      p: String(page),
      size: String(pageSize),
    })
    const res = await siteFetch(joinUrl(baseUrl, `/api/token/?${params.toString()}`), {
      method: "GET",
      headers: buildHeaders(accessToken, userId),
      signal,
    })
    if (!res.ok) await decodeError(res)
    const body = await res.json()
    const pageData = unwrap<NewApiToken[] | { items?: NewApiToken[] }>(body)
    let items: NewApiToken[]
    if (Array.isArray(pageData)) {
      items = pageData
    } else if (pageData && Array.isArray(pageData.items)) {
      items = pageData.items
    } else {
      items = []
    }
    if (items.length === 0) break
    all.push(...items)
    // 数组或未带分页元数据：不足一页即末尾
    if (items.length < pageSize) break
    page += 1
  }
  return all
}

/** 创建 Token。POST /api/token/ */
export async function createToken(
  baseUrl: string,
  accessToken: string,
  userId: string | undefined,
  input: NewApiTokenInput,
  signal?: AbortSignal,
): Promise<NewApiToken> {
  const res = await siteFetch(joinUrl(baseUrl, "/api/token/"), {
    method: "POST",
    headers: buildHeaders(accessToken, userId),
    body: JSON.stringify(input),
    signal,
  })
  if (!res.ok) await decodeError(res)
  const body = await res.json()
  return unwrap<NewApiToken>(body)
}

/** 更新 Token。PUT /api/token/ */
export async function updateToken(
  baseUrl: string,
  accessToken: string,
  userId: string | undefined,
  input: NewApiTokenInput & { id: number },
  signal?: AbortSignal,
): Promise<void> {
  const res = await siteFetch(joinUrl(baseUrl, "/api/token/"), {
    method: "PUT",
    headers: buildHeaders(accessToken, userId),
    body: JSON.stringify(input),
    signal,
  })
  if (!res.ok) await decodeError(res)
}

/** 删除 Token。DELETE /api/token/{id} */
export async function deleteToken(
  baseUrl: string,
  accessToken: string,
  userId: string | undefined,
  tokenId: number,
  signal?: AbortSignal,
): Promise<void> {
  const res = await siteFetch(joinUrl(baseUrl, `/api/token/${tokenId}`), {
    method: "DELETE",
    headers: buildHeaders(accessToken, userId),
    signal,
  })
  if (!res.ok) await decodeError(res)
}

/** 签到状态。GET /api/user/checkin?month=YYYY-MM → { enabled, stats } */
export async function fetchCheckInStatus(
  baseUrl: string,
  accessToken: string,
  userId?: string,
  signal?: AbortSignal,
): Promise<{ enabled: boolean; checkedInToday: boolean } | null> {
  const month = new Date().toISOString().slice(0, 7)
  const res = await siteFetch(
    joinUrl(baseUrl, `/api/user/checkin?month=${month}`),
    {
      method: "GET",
      headers: buildHeaders(accessToken, userId),
      signal,
    },
  )
  if (!res.ok) {
    // 404/500 = 站点不支持签到
    if (res.status === 404 || res.status === 500) return null
    await decodeError(res)
  }
  const body = await res.json()
  const data = unwrap<{ enabled?: boolean; stats?: { checked_in_today?: boolean } }>(body)
  return {
    enabled: data?.enabled ?? false,
    checkedInToday: data?.stats?.checked_in_today ?? false,
  }
}

/** 签到。POST /api/user/checkin → { success, message, data } */
export async function checkIn(
  baseUrl: string,
  accessToken: string,
  userId?: string,
  signal?: AbortSignal,
): Promise<{ success: boolean; message: string }> {
  const res = await siteFetch(joinUrl(baseUrl, "/api/user/checkin"), {
    method: "POST",
    headers: buildHeaders(accessToken, userId),
    signal,
  })
  if (!res.ok) await decodeError(res)
  const body = await res.json()
  const envelope = body as { success?: boolean; message?: string }
  return {
    success: envelope.success ?? false,
    message: envelope.message ?? (envelope.success ? "签到成功" : "签到失败"),
  }
}

/** 取 Token 真 key。POST /api/token/{id}/key → { data: { key } }。
 * 列表里 key 是掩码的，真 key 要单独 reveal。 */
export async function fetchTokenSecretKey(
  baseUrl: string,
  accessToken: string,
  userId: string | undefined,
  tokenId: number,
  signal?: AbortSignal,
): Promise<string> {
  const res = await siteFetch(joinUrl(baseUrl, `/api/token/${tokenId}/key`), {
    method: "POST",
    headers: buildHeaders(accessToken, userId),
    signal,
  })
  if (!res.ok) await decodeError(res)
  const body = await res.json()
  const data = unwrap<{ key?: string }>(body)
  const key = data?.key ?? ""
  if (!key) throw new Error("未返回 token key")
  return key
}
