// Tiny API Hub — 共享类型

export type SiteType = "new-api"

export type AuthType = "accessToken" | "cookie"

export type HealthStatus = "healthy" | "error" | "unknown"

export interface Account {
  id: string
  name: string
  baseUrl: string
  siteType: SiteType
  authType: AuthType
  accessToken: string
  /** 站点用户 id（New API family 需要 New-API-User 头；可选） */
  userId?: string
  /** 剩余额度（站点原始 quota） */
  quota?: number
  /** 余额（USD） */
  balance?: number
  lastSyncTime?: number
  lastSyncError?: string
  health: HealthStatus
  disabled: boolean
  pinned: boolean
  note?: string
  /** 手动排序顺序，越小越靠前 */
  order: number
  createdAt: number
}

export interface AccountInput {
  name: string
  baseUrl: string
  siteType: SiteType
  accessToken: string
  userId?: string
  note?: string
}
