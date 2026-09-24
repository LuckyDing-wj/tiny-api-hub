import type { Account, AccountInput, HealthStatus } from "~/types"
import { NewApiError, fetchSiteStatus, quotaToBalance, refreshNewApiAccount } from "~/services/newApi"
import {
  createAccessTokenInTab,
  createAccessTokenInTabWithJwt,
  fetchUserSelfInTab,
  readCurrentTabSession,
  refreshAuthBundleInTab,
} from "~/services/currentTab"
import {
  assertNewApiSite,
  getAccount,
  loadAccounts,
  nextOrder,
  patchAccount,
  upsertAccount,
} from "~/services/storage"

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `acct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function classifyHealth(error: unknown): HealthStatus {
  if (error instanceof NewApiError) return "error"
  return "unknown"
}

/** 验证并创建账号；失败抛错。 */
export async function createAccount(input: AccountInput): Promise<Account> {
  assertNewApiSite(input.siteType)

  if (!input.baseUrl.trim()) throw new Error("站点地址不能为空")
  if (!input.accessToken.trim()) throw new Error("Access Token 不能为空")

  // 创建即先探一次，拿 userId 和 quota。
  const snapshot = await refreshNewApiAccount(
    input.baseUrl.trim(),
    input.accessToken.trim(),
    input.userId?.trim(),
  )

  const now = Date.now()
  const account: Account = {
    id: genId(),
    name: input.name.trim() || snapshot.siteName || snapshot.username || input.baseUrl.trim(),
    baseUrl: input.baseUrl.trim(),
    siteType: input.siteType,
    authType: "accessToken",
    accessToken: snapshot.accessToken || input.accessToken.trim(),
    userId: snapshot.userId || input.userId?.trim(),
    quota: snapshot.quota,
    balance: snapshot.balance,
    lastSyncTime: now,
    health: "healthy",
    disabled: false,
    pinned: false,
    note: input.note?.trim() || undefined,
    order: await nextOrder(),
    createdAt: now,
  }
  await upsertAccount(account)
  return account
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin
  } catch {
    return left.replace(/\/+$/, "") === right.replace(/\/+$/, "")
  }
}

/** 找同源已存在账号（添加前去重提示用）。 */
export async function findSameOriginAccount(baseUrl: string): Promise<Account | undefined> {
  return (await loadAccounts()).find((account) => sameOrigin(account.baseUrl, baseUrl))
}

/** 当前标签页已登录的 New API 账号导入。失败明确报错，不兜底。 */
export async function importCurrentTabAccount(): Promise<Account> {
  const session = await readCurrentTabSession()
  let userId = session.userId
  let accessToken = session.accessToken ?? ""
  let bundleQuota: number | undefined

  // 1. localStorage 没 PAT：试 /api/user/auth/refresh 拿 JWT + userId + quota
  //    JWT 不能跨域打 /api/user/self，只用来拿 userId 和 quota
  let sessionJwt = ""
  if (!accessToken) {
    const bundle = await refreshAuthBundleInTab(session.origin)
    if (bundle) {
      sessionJwt = bundle.accessToken
      userId = bundle.userId ?? userId
      bundleQuota = bundle.quota
    }
  }

  // 2. 还没 PAT：回退到旧版 cookie 打 /api/user/self
  if (!accessToken) {
    try {
      const user = await fetchUserSelfInTab(session.origin, userId)
      userId = user.id != null ? String(user.id) : userId
      accessToken = typeof user.access_token === "string" ? user.access_token.trim() : ""
    } catch (err) {
      // 旧版接口无权，继续往下试
      console.warn("[tiny-api-hub] /api/user/self 回退失败", err)
    }
  }

  // 3. 有 JWT（新版）但没 PAT：用 JWT 当 Authorization 生成一把 PAT
  //    或旧版没任何 token：cookie 同源 GET /api/user/token 生成
  if (!accessToken && sessionJwt) {
    try {
      accessToken = await createAccessTokenInTabWithJwt(session.origin, sessionJwt, userId)
    } catch (err) {
      // JWT 生成失败，回退到 cookie
      console.warn("[tiny-api-hub] JWT 生成 PAT 失败", err)
    }
  }
  if (!accessToken) {
    try {
      accessToken = await createAccessTokenInTab(session.origin, userId)
    } catch (err) {
      // cookie 生成也失败
      console.warn("[tiny-api-hub] cookie 生成 PAT 失败", err)
    }
  }
  if (!accessToken) {
    // PAT 全失败，用 JWT 顶着（刷新会失败但账号能存）
    accessToken = sessionJwt
  }
  if (!accessToken) {
    throw new Error("当前站点没有 Access Token，且自动创建失败")
  }

  const existing = (await loadAccounts()).find(
    (account) =>
      sameOrigin(account.baseUrl, session.origin) &&
      (userId ? account.userId === userId : true),
  )

  // 优先用 bundle 自带的 quota（避免跨域打 /api/user/self 被拒）
  if (bundleQuota != null) {
    const quota = bundleQuota
    const status = await fetchSiteStatus(session.origin)
    const siteName = status?.system_name?.trim() || undefined
    if (existing) {
      const patched = await patchAccount(existing.id, {
        accessToken,
        userId: userId || existing.userId,
        quota,
        balance: quotaToBalance(quota),
        lastSyncTime: Date.now(),
        lastSyncError: undefined,
        health: "healthy",
      })
      if (!patched) throw new Error("更新已有账号失败")
      return patched
    }
    const now = Date.now()
    const account: Account = {
      id: genId(),
      name: siteName || session.username || session.origin,
      baseUrl: session.origin,
      siteType: "new-api",
      authType: "accessToken",
      accessToken,
      userId,
      quota,
      balance: quotaToBalance(quota),
      lastSyncTime: now,
      health: "healthy",
      disabled: false,
      pinned: false,
      order: await nextOrder(),
      createdAt: now,
    }
    await upsertAccount(account)
    return account
  }

  // 没 bundle quota：走标准 refresh（跨域打 /api/user/self）
  if (existing) {
    try {
      const snapshot = await refreshNewApiAccount(
        existing.baseUrl,
        accessToken,
        userId || existing.userId,
      )
      const patched = await patchAccount(existing.id, {
        accessToken: snapshot.accessToken || accessToken,
        userId: snapshot.userId || userId || existing.userId,
        quota: snapshot.quota,
        balance: snapshot.balance,
        lastSyncTime: Date.now(),
        lastSyncError: undefined,
        health: "healthy",
      })
      if (!patched) throw new Error("更新已有账号失败")
      return patched
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const patched = await patchAccount(existing.id, {
        accessToken,
        userId: userId || existing.userId,
        lastSyncTime: Date.now(),
        lastSyncError: message,
        health: classifyHealth(err),
      })
      if (!patched) throw new Error("更新已有账号失败")
      return patched
    }
  }

  return createAccount({
    name: "",
    baseUrl: session.origin,
    siteType: "new-api",
    accessToken,
    userId,
  })
}

/** 刷新单个账号余额。 */
export async function refreshAccount(id: string): Promise<Account | undefined> {
  const account = await getAccount(id)
  if (!account) return undefined
  try {
    const snapshot = await refreshNewApiAccount(
      account.baseUrl,
      account.accessToken,
      account.userId,
    )
    const patched = await patchAccount(id, {
      quota: snapshot.quota,
      balance: snapshot.balance,
      userId: snapshot.userId || account.userId,
      accessToken: snapshot.accessToken || account.accessToken,
      lastSyncTime: Date.now(),
      lastSyncError: undefined,
      health: "healthy",
    })
    return patched
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const patched = await patchAccount(id, {
      lastSyncTime: Date.now(),
      lastSyncError: message,
      health: classifyHealth(error),
    })
    return patched
  }
}
