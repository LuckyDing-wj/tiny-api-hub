// 临时页过盾：Cloudflare 挡住直连时，后台开静默 tab 到站点 → 等 JS 挑战自动过 →
// 在该页上下文发同源 fetch（带真 cookie/指纹）→ 结果回传 → 关 tab。
// 协议对齐旧仓 tempWindowPool/tempWindowFetch，实现独立新写。

import type { ShieldDetection } from "~/services/shieldDetect"
import { detectShieldPage } from "~/services/shieldDetect"

export const TEMP_PAGE_FETCH_TYPE = "tiny-api-hub:temp-page-fetch"

export interface TempPageFetchRequest {
  /** 站点 origin，临时 tab 打开这里。 */
  origin: string
  /** 页内要请求的完整 URL，必须与 origin 同源。 */
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | null
  /** 等盾放行的总时长，含 tab 加载。默认 25s。 */
  timeoutMs?: number
}

export type TempPageFailureKind =
  | "challenge_timeout"
  | "network"
  | "timeout"
  | "invalid"
  | "internal"

export type TempPageResult =
  | { ok: true; status: number; bodyText: string; contentType: string | null }
  | { ok: false; kind: TempPageFailureKind; error: string }

const DEFAULT_TIMEOUT_MS = 25_000
const TAB_LOAD_TIMEOUT_MS = 15_000
const IN_PAGE_FETCH_TIMEOUT_MS = 15_000
const DETECT_INTERVAL_MS = 1_000
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "HEAD"])

// ---------- popup / 调用方侧 ----------

/** 从扩展页面（popup 等）向 background 请求一次临时页 fetch。 */
export function requestTempPageFetch(
  req: TempPageFetchRequest,
): Promise<TempPageResult> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: TEMP_PAGE_FETCH_TYPE, ...req },
        (res: unknown) => {
          const err = chrome.runtime.lastError
          if (err) {
            resolve({ ok: false, kind: "network", error: err.message ?? "runtime 消息失败" })
            return
          }
          if (!res || typeof res !== "object" || !("ok" in res)) {
            resolve({
              ok: false,
              kind: "internal",
              error: "临时页返回缺失",
            })
            return
          }
          resolve(res as TempPageResult)
        },
      )
    } catch (error) {
      resolve({
        ok: false,
        kind: "network",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}

// ---------- background 侧 ----------

function fail(kind: TempPageFailureKind, error: string): TempPageResult {
  return { ok: false, kind, error }
}

function normalizeRequest(raw: unknown):
  | { ok: true; req: TempPageFetchRequest }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "请求格式无效" }
  }
  const req = raw as Partial<TempPageFetchRequest>
  if (typeof req.origin !== "string" || typeof req.url !== "string") {
    return { ok: false, error: "origin/url 缺失" }
  }
  let origin: URL
  let target: URL
  try {
    origin = new URL(req.origin)
    target = new URL(req.url)
  } catch {
    return { ok: false, error: "origin/url 非法" }
  }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    return { ok: false, error: "origin 必须是 http(s)" }
  }
  if (target.origin !== origin.origin) {
    return { ok: false, error: "目标 URL 与 origin 不同源" }
  }
  const method = (req.method ?? "GET").toUpperCase()
  if (!ALLOWED_METHODS.has(method)) {
    return { ok: false, error: `方法不允许: ${method}` }
  }
  const timeoutMs = Math.min(Math.max(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, 5_000), 60_000)
  return {
    ok: true,
    req: {
      origin: origin.origin,
      url: target.toString(),
      method,
      headers: req.headers,
      body: typeof req.body === "string" ? req.body : null,
      timeoutMs,
    },
  }
}

/** 串行队列：避免“刷新全部”同时开一排 tab。 */
let taskQueue: Promise<unknown> = Promise.resolve()
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = taskQueue.then(task, task)
  taskQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitTabLoad(tabId: number, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === "complete") return
    await sleep(300)
  }
  throw new Error("tab 加载超时")
}

/** 注入检测。页面导航中/错误页注入会失败 → 返回 null 表示本轮未知。 */
async function detectInTab(tabId: number): Promise<ShieldDetection | null> {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: detectShieldPage,
    })
    return (res?.result as ShieldDetection | undefined) ?? null
  } catch {
    return null
  }
}

/** 自包含页内 fetch，随 executeScript 注入。 */
async function fetchInPage(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | null },
): Promise<{ status: number; bodyText: string; contentType: string | null }> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body ?? undefined,
    credentials: "include",
  })
  const bodyText = await res.text()
  return {
    status: res.status,
    bodyText,
    contentType: res.headers.get("content-type"),
  }
}

async function fetchInTab(
  tabId: number,
  req: TempPageFetchRequest,
): Promise<TempPageResult> {
  try {
    const execute = chrome.scripting
      .executeScript({
        target: { tabId },
        func: fetchInPage,
        args: [
          req.url,
          { method: req.method, headers: req.headers, body: req.body },
        ],
      })
      .then(
        (res) => res as Array<{ result?: { status: number; bodyText: string; contentType: string | null } }>,
      )
    const raceLoserGuard = execute.catch(() => undefined)
    const result = await Promise.race([
      execute,
      sleep(IN_PAGE_FETCH_TIMEOUT_MS).then(() => {
        throw new Error("页内请求超时")
      }),
    ])
    void raceLoserGuard

    const payload = result?.[0]?.result
    if (!payload) {
      return fail("network", "页内请求无结果")
    }
    return { ok: true, status: payload.status, bodyText: payload.bodyText, contentType: payload.contentType }
  } catch (error) {
    return fail("network", error instanceof Error ? error.message : String(error))
  }
}

async function runTempPageFetch(req: TempPageFetchRequest): Promise<TempPageResult> {
  let tabId: number | undefined
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs
  try {
    const tab = await chrome.tabs.create({ url: `${req.origin}/`, active: false })
    tabId = tab.id
    if (tabId === undefined) {
      return fail("internal", "无法创建临时页")
    }
    try {
      await waitTabLoad(tabId, Math.min(deadline, Date.now() + TAB_LOAD_TIMEOUT_MS))
    } catch {
      // 加载超时也继续轮询：慢站点可能仍在跳挑战，由 deadline 统一收口
    }

    let sawDetection = false
    while (Date.now() < deadline) {
      const detection = await detectInTab(tabId)
      if (detection) {
        sawDetection = true
        if (!detection.isChallenge) {
          return await fetchInTab(tabId, req)
        }
      }
      await sleep(DETECT_INTERVAL_MS)
    }
    return sawDetection
      ? fail("challenge_timeout", "站点人机验证未自动通过，请打开站点手动过一次")
      : fail("network", "站点页面无法打开或注入")
  } finally {
    if (tabId !== undefined) {
      try {
        await chrome.tabs.remove(tabId)
      } catch {
        // tab 已被站点或用户关掉，忽略
      }
    }
  }
}

/** background 消息入口。返回 true 表示异步 sendResponse。 */
export function handleTempPageFetchMessage(
  msg: unknown,
  sendResponse: (res: TempPageResult) => void,
): boolean {
  const normalized = normalizeRequest(msg)
  if (!normalized.ok) {
    sendResponse(fail("invalid", normalized.error))
    return true
  }
  enqueue(() => runTempPageFetch(normalized.req))
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        kind: "internal",
        error: error instanceof Error ? error.message : String(error),
      })
    })
  return true
}
