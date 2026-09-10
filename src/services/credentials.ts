import { NewApiError, fetchUserSelf } from "~/services/newApi"

const CREDENTIALS_KEY = "tiny_api_hub_credentials_v1"

export interface Credential {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  note?: string
  /** 关联的账号 id（可选） */
  linkedAccountId?: string
  /** 上次测连通结果 */
  lastVerified?: "ok" | "fail"
  lastVerifiedTime?: number
  lastVerifiedError?: string
  createdAt: number
}

export interface CredentialInput {
  name: string
  baseUrl: string
  apiKey: string
  note?: string
  linkedAccountId?: string
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function loadCredentials(): Promise<Credential[]> {
  const res = await chrome.storage.local.get(CREDENTIALS_KEY)
  const value = res[CREDENTIALS_KEY]
  return Array.isArray(value) ? (value as Credential[]) : []
}

export async function saveCredentials(creds: Credential[]): Promise<void> {
  await chrome.storage.local.set({ [CREDENTIALS_KEY]: creds })
}

export async function createCredential(input: CredentialInput): Promise<Credential> {
  if (!input.baseUrl.trim()) throw new Error("站点地址不能为空")
  if (!input.apiKey.trim()) throw new Error("API Key 不能为空")
  const cred: Credential = {
    id: genId(),
    name: input.name.trim() || input.baseUrl.trim(),
    baseUrl: input.baseUrl.trim(),
    apiKey: input.apiKey.trim(),
    note: input.note?.trim() || undefined,
    linkedAccountId: input.linkedAccountId || undefined,
    createdAt: Date.now(),
  }
  const creds = await loadCredentials()
  creds.push(cred)
  await saveCredentials(creds)
  return cred
}

export async function updateCredential(
  id: string,
  patch: Partial<CredentialInput>,
): Promise<void> {
  const creds = await loadCredentials()
  const idx = creds.findIndex((c) => c.id === id)
  if (idx < 0) throw new Error("凭据不存在")
  creds[idx] = { ...creds[idx], ...patch }
  await saveCredentials(creds)
}

export async function removeCredential(id: string): Promise<void> {
  const creds = await loadCredentials()
  await saveCredentials(creds.filter((c) => c.id !== id))
}

/** 测连通：GET /api/user/self，拿余额验证 key 可用。 */
export async function verifyCredential(id: string): Promise<Credential> {
  const creds = await loadCredentials()
  const cred = creds.find((c) => c.id === id)
  if (!cred) throw new Error("凭据不存在")
  try {
    const user = await fetchUserSelf(cred.baseUrl, cred.apiKey)
    const idx = creds.findIndex((c) => c.id === id)
    creds[idx] = {
      ...cred,
      lastVerified: "ok",
      lastVerifiedTime: Date.now(),
      lastVerifiedError: undefined,
      name: cred.name || user.username || cred.baseUrl,
    }
    await saveCredentials(creds)
    return creds[idx]
  } catch (err) {
    const message =
      err instanceof NewApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err)
    const idx = creds.findIndex((c) => c.id === id)
    creds[idx] = {
      ...cred,
      lastVerified: "fail",
      lastVerifiedTime: Date.now(),
      lastVerifiedError: message,
    }
    await saveCredentials(creds)
    throw err
  }
}
