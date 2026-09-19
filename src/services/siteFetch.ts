// 站点请求统一入口：直连 → 响应疑似 CF 盾 → 临时页过盾重试一次。
// 直连保持 credentials:"omit"：带 include 会把浏览器里站点网页 session cookie 附上，
// New API 可能按 cookie session 解析成另一个用户。临时页 fetch 带 include 是为了
// cf_clearance，但走 Authorization 头，New API 头优先，无冲突。

import { requestTempPageFetch } from "~/services/tempPage"

const SHIELD_BODY_MARKERS = [
  "challenge-platform",
  "_cf_chl_opt",
  "challenges.cloudflare.com",
  "__cf_chl",
  "Just a moment",
  "请稍候",
]

/** 403/503/429 + HTML + 盾特征 → 判定被盾拦。 */
function looksLikeShieldResponse(
  status: number,
  contentType: string | null,
  bodyText: string,
): boolean {
  if (status !== 403 && status !== 503 && status !== 429) return false
  if (contentType && !contentType.includes("text/html")) return false
  return SHIELD_BODY_MARKERS.some((m) => bodyText.includes(m))
}

/**
 * 对站点 API 发一次请求，返回标准 Response。
 * 直连响应带盾特征时，自动改走临时页（background）重试一次；
 * 临时页也失败则抛错（含引导文案）。网络层错误原样抛出，不重试。
 */
export async function siteFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | null; signal?: AbortSignal } = {},
): Promise<Response> {
  // DNS/连接层失败临时页救不了，原样抛出，不重试
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body ?? undefined,
    credentials: "omit",
    cache: "no-store",
    signal: init.signal,
  })

  if (res.ok) return res
  if (res.status !== 403 && res.status !== 503 && res.status !== 429) {
    return res
  }
  const contentType = res.headers.get("content-type")
  if (contentType && !contentType.includes("text/html")) {
    return res
  }
  const sniffText = await res.clone().text()
  if (!looksLikeShieldResponse(res.status, contentType, sniffText)) {
    return res
  }

  const origin = new URL(url).origin
  const via = await requestTempPageFetch({
    origin,
    url,
    method: init.method,
    headers: init.headers,
    body: init.body ?? null,
  })
  init.signal?.throwIfAborted()
  if (!via.ok) {
    throw new Error(via.error)
  }
  return new Response(via.bodyText, {
    status: via.status,
    headers: via.contentType ? { "content-type": via.contentType } : {},
  })
}
