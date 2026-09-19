export interface CurrentTabSession {
  origin: string
  userId?: string
  username?: string
  accessToken?: string
}

function originOf(url: string): string {
  return new URL(url).origin
}

function readStoredUser(): {
  id?: string
  username?: string
  access_token?: string
} | null {
  try {
    const raw = localStorage.getItem("user")
    if (!raw) return null
    const user = JSON.parse(raw) as Record<string, unknown>
    const id =
      user.id != null && (typeof user.id === "string" || typeof user.id === "number")
        ? String(user.id)
        : undefined
    const username = typeof user.username === "string" ? user.username : undefined
    const access_token =
      typeof user.access_token === "string" && user.access_token.trim()
        ? user.access_token.trim()
        : undefined
    if (!id && !username && !access_token) return null
    return { id, username, access_token }
  } catch {
    return null
  }
}

function isHttpTab(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url))
}

export async function getActiveHttpTab(): Promise<{ id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !isHttpTab(tab.url)) {
    throw new Error("当前标签不是 http(s) 页面")
  }
  return { id: tab.id, url: tab.url }
}

export async function readCurrentTabSession(): Promise<CurrentTabSession> {
  const tab = await getActiveHttpTab()
  const origin = originOf(tab.url)
  const [{ result } = { result: undefined }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: readStoredUser,
  })
  return {
    origin,
    userId: result?.id,
    username: result?.username,
    accessToken: result?.access_token,
  }
}

/**
 * 新版 New API：POST /api/user/auth/refresh，用 cookie 换一把 session Bearer token。
 * 旧版站点没这接口（404/405），返回 null 回退到 /api/user/self。
 */
export async function refreshAuthBundleInTab(
  origin: string,
): Promise<{ accessToken: string; userId?: string; username?: string; quota?: number } | null> {
  const tab = await getActiveHttpTab()
  const [{ result } = { result: null }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    args: [origin],
    func: async (baseUrl: string) => {
      try {
        const res = await fetch(
          `${baseUrl.replace(/\/+$/, "")}/api/user/auth/refresh`,
          { method: "POST", credentials: "include", cache: "no-store" },
        )
        if (res.status === 404 || res.status === 405) return null
        if (!res.ok) return { error: `HTTP ${res.status}` }
        const body = (await res.json()) as Record<string, unknown>
        if (body.success !== true) return { error: "not success" }
        const data = (body.data ?? {}) as Record<string, unknown>
        const token = typeof data.access_token === "string" ? data.access_token.trim() : ""
        const user = (data.user ?? {}) as Record<string, unknown>
        const userId =
          user.id != null ? String(user.id) : undefined
        const username = typeof user.username === "string" ? user.username : undefined
        const quota = typeof user.quota === "number" ? user.quota : undefined
        if (!token) return { error: "no token in bundle" }
        return { accessToken: token, userId, username, quota }
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    },
  })
  if (!result) return null
  if ("error" in result) return null
  return result
}

export async function fetchUserSelfInTab(origin: string, userId?: string) {
  const tab = await getActiveHttpTab()
  const [{ result } = { result: undefined }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    args: [origin, userId ?? ""],
    func: async (baseUrl: string, id: string) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (id) headers["New-API-User"] = id
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/user/self`, {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
      })
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      return {
        ok: res.ok,
        status: res.status,
        message:
          body && typeof body.message === "string" ? body.message : res.statusText,
        data: body && "data" in body ? body.data : body,
      }
    },
  })
  if (!result) throw new Error("无法在当前标签读取用户信息")
  if (!result.ok) {
    throw new Error(result.message || `读取用户失败 HTTP ${result.status}`)
  }
  return result.data as {
    id?: number | string
    username?: string
    access_token?: string
    quota?: number
  }
}

/** 共用核心：cookie 会话或 JWT 换一把真 PAT。authHeader 空串 = 纯 cookie 模式。 */
async function createTokenInTab(
  origin: string,
  authHeader: string,
  userId: string | undefined,
  nullResultMessage: string,
): Promise<string> {
  const tab = await getActiveHttpTab()
  const [{ result } = { result: undefined }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    args: [origin, authHeader, userId ?? ""],
    func: async (baseUrl: string, auth: string, id: string) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (auth) headers["Authorization"] = auth
      if (id) headers["New-API-User"] = id
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/user/token`, {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
      })
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      const data = body && "data" in body ? body.data : body
      return {
        ok: res.ok,
        status: res.status,
        message:
          body && typeof body.message === "string" ? body.message : res.statusText,
        token: typeof data === "string" ? data : "",
      }
    },
  })
  if (!result) throw new Error(nullResultMessage)
  if (!result.ok || !result.token.trim()) {
    throw new Error(result.message || "站点没有返回 Access Token")
  }
  return result.token.trim()
}

export async function createAccessTokenInTab(origin: string, userId?: string): Promise<string> {
  return createTokenInTab(origin, "", userId, "无法在当前标签创建 Access Token")
}

/** 用 JWT 当 Authorization 调 /api/user/token 生成真 PAT（跨域能用）。 */
export async function createAccessTokenInTabWithJwt(
  origin: string,
  jwt: string,
  userId?: string,
): Promise<string> {
  return createTokenInTab(origin, `Bearer ${jwt}`, userId, "无法用 JWT 创建 Access Token")
}
