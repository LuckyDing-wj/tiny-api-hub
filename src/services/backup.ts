import type { Account } from "~/types"
import { loadAccounts, saveAccounts } from "~/services/storage"
import {
  loadCredentials,
  saveCredentials,
  type Credential,
} from "~/services/credentials"
import {
  loadPreferences,
  normalizePreferences,
  savePreferences,
  type Preferences,
} from "~/services/preferences"

export const BACKUP_KIND = "tiny-api-hub"
export const BACKUP_VERSION = "1.0"

export type BackupScope = "all" | "accounts" | "preferences"

export type ImportMode = "merge" | "replace"

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackupError"
  }
}

export interface BackupEnvelope {
  kind: typeof BACKUP_KIND
  version: string
  timestamp: number
  type?: BackupScope
  accounts?: Account[]
  credentials?: Credential[]
  preferences?: Preferences
}

export interface BackupSummary {
  timestamp: number
  accounts: number
  credentials: number
  hasPreferences: boolean
  rejectedSiteTypes: string[]
}

export interface ImportResult {
  accountsImported: number
  credentialsImported: number
  preferencesImported: boolean
  skippedUnsupported: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isNewApiAccount(value: unknown): value is Account {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string" || !value.id) return false
  if (typeof value.baseUrl !== "string" || !value.baseUrl.trim()) return false
  if (typeof value.accessToken !== "string") return false
  if (value.siteType !== undefined && value.siteType !== "new-api") return false
  return true
}

function siteTypeOf(value: unknown): string {
  if (isRecord(value) && typeof value.siteType === "string" && value.siteType) {
    return value.siteType
  }
  return "(unknown)"
}

function coerceAccount(raw: unknown): Account | null {
  if (!isNewApiAccount(raw)) return null
  const now = Date.now()
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : raw.baseUrl,
    baseUrl: raw.baseUrl.trim(),
    siteType: "new-api",
    authType: raw.authType === "cookie" ? "cookie" : "accessToken",
    accessToken: raw.accessToken,
    userId: typeof raw.userId === "string" && raw.userId ? raw.userId : undefined,
    quota: typeof raw.quota === "number" ? raw.quota : undefined,
    balance: typeof raw.balance === "number" ? raw.balance : undefined,
    lastSyncTime: typeof raw.lastSyncTime === "number" ? raw.lastSyncTime : undefined,
    lastSyncError:
      typeof raw.lastSyncError === "string" ? raw.lastSyncError : undefined,
    health:
      raw.health === "healthy" || raw.health === "error" || raw.health === "unknown"
        ? raw.health
        : "unknown",
    disabled: Boolean(raw.disabled),
    pinned: Boolean(raw.pinned),
    note: typeof raw.note === "string" && raw.note ? raw.note : undefined,
    order: typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : 0,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
  }
}

function coerceCredential(raw: unknown): Credential | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== "string" || !raw.id) return null
  if (typeof raw.baseUrl !== "string" || !raw.baseUrl.trim()) return null
  if (typeof raw.apiKey !== "string" || !raw.apiKey) return null
  const now = Date.now()
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : raw.baseUrl,
    baseUrl: raw.baseUrl.trim(),
    apiKey: raw.apiKey,
    note: typeof raw.note === "string" && raw.note ? raw.note : undefined,
    linkedAccountId:
      typeof raw.linkedAccountId === "string" && raw.linkedAccountId
        ? raw.linkedAccountId
        : undefined,
    lastVerified:
      raw.lastVerified === "ok" || raw.lastVerified === "fail"
        ? raw.lastVerified
        : undefined,
    lastVerifiedTime:
      typeof raw.lastVerifiedTime === "number" ? raw.lastVerifiedTime : undefined,
    lastVerifiedError:
      typeof raw.lastVerifiedError === "string" ? raw.lastVerifiedError : undefined,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
  }
}

function extractAccountList(data: Record<string, unknown>): unknown[] {
  if (Array.isArray(data.accounts)) return data.accounts
  if (isRecord(data.accounts) && Array.isArray(data.accounts.accounts)) {
    return data.accounts.accounts
  }
  if (isRecord(data.data) && Array.isArray(data.data.accounts)) {
    return data.data.accounts
  }
  return []
}

function extractCredentialList(data: Record<string, unknown>): unknown[] {
  if (Array.isArray(data.credentials)) return data.credentials
  if (Array.isArray(data.apiCredentialProfiles)) return data.apiCredentialProfiles
  if (
    isRecord(data.apiCredentialProfiles) &&
    Array.isArray(data.apiCredentialProfiles.profiles)
  ) {
    return data.apiCredentialProfiles.profiles
  }
  return []
}

function extractPreferences(data: Record<string, unknown>): unknown {
  if (data.preferences !== undefined) return data.preferences
  if (isRecord(data.data) && data.data.preferences !== undefined) {
    return data.data.preferences
  }
  return undefined
}

export function parseBackup(json: string): {
  accounts: Account[]
  credentials: Credential[]
  preferences: Preferences | null
  summary: BackupSummary
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new BackupError("JSON 格式不正确")
  }
  if (!isRecord(parsed)) {
    throw new BackupError("备份不是 JSON 对象")
  }

  const rawAccounts = extractAccountList(parsed)
  const rawCredentials = extractCredentialList(parsed)
  const rawPreferences = extractPreferences(parsed)

  const rejectedSiteTypes: string[] = []
  const accounts: Account[] = []
  for (const item of rawAccounts) {
    const account = coerceAccount(item)
    if (account) {
      accounts.push(account)
      continue
    }
    if (isRecord(item)) {
      rejectedSiteTypes.push(siteTypeOf(item))
    }
  }

  const credentials = rawCredentials
    .map(coerceCredential)
    .filter((c): c is Credential => c !== null)

  const hasPreferences = rawPreferences !== undefined
  const preferences = hasPreferences ? normalizePreferences(rawPreferences) : null

  if (accounts.length === 0 && credentials.length === 0 && !hasPreferences) {
    if (rejectedSiteTypes.length > 0) {
      const unique = [...new Set(rejectedSiteTypes)]
      throw new BackupError(
        `备份里没有 New API 账号。不支持的站点类型：${unique.join(", ")}`,
      )
    }
    throw new BackupError("备份里没有可导入的账号、凭据或偏好")
  }

  return {
    accounts,
    credentials,
    preferences,
    summary: {
      timestamp:
        typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
      accounts: accounts.length,
      credentials: credentials.length,
      hasPreferences,
      rejectedSiteTypes: [...new Set(rejectedSiteTypes)],
    },
  }
}

export async function buildBackup(scope: BackupScope): Promise<BackupEnvelope> {
  const timestamp = Date.now()
  if (scope === "accounts") {
    return {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      timestamp,
      type: "accounts",
      accounts: await loadAccounts(),
    }
  }
  if (scope === "preferences") {
    return {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      timestamp,
      type: "preferences",
      preferences: await loadPreferences(),
    }
  }
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    timestamp,
    type: "all",
    accounts: await loadAccounts(),
    credentials: await loadCredentials(),
    preferences: await loadPreferences(),
  }
}

export function serializeBackup(backup: BackupEnvelope): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function backupFilename(scope: BackupScope, timestamp = Date.now()): string {
  const stamp = new Date(timestamp)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-")
  const suffix =
    scope === "all" ? "all" : scope === "accounts" ? "accounts" : "preferences"
  return `tiny-api-hub-${suffix}-${stamp}.json`
}

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  mode: ImportMode,
): T[] {
  if (mode === "replace") return incoming
  const map = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) {
    map.set(item.id, item)
  }
  return [...map.values()]
}

export async function importBackup(
  json: string,
  mode: ImportMode,
): Promise<ImportResult> {
  const parsed = parseBackup(json)

  if (parsed.accounts.length > 0) {
    const existing = await loadAccounts()
    await saveAccounts(mergeById(existing, parsed.accounts, mode))
  }

  if (parsed.credentials.length > 0) {
    const existing = await loadCredentials()
    await saveCredentials(mergeById(existing, parsed.credentials, mode))
  }

  let preferencesImported = false
  if (parsed.preferences) {
    if (mode === "replace") {
      await savePreferences(parsed.preferences)
    } else {
      const existing = await loadPreferences()
      await savePreferences({ ...existing, ...parsed.preferences })
    }
    preferencesImported = true
  }

  return {
    accountsImported: parsed.accounts.length,
    credentialsImported: parsed.credentials.length,
    preferencesImported,
    skippedUnsupported: parsed.summary.rejectedSiteTypes.length,
  }
}
