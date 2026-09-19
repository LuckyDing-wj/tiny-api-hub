import { assertNewApiSite, requireAccount } from "~/services/storage"
import {
  createToken,
  deleteToken,
  fetchTokenSecretKey,
  fetchTokens,
  fetchUserGroups,
  updateToken,
  type NewApiToken,
  type NewApiTokenInput,
  type NewApiUserGroup,
} from "~/services/newApi"

/** 列出账号下所有 Token。 */
export async function listTokens(accountId: string): Promise<NewApiToken[]> {
  const account = await requireAccount(accountId)
  assertNewApiSite(account.siteType)
  return fetchTokens(account.baseUrl, account.accessToken, account.userId)
}

/** 新建 Token。 */
export async function createKey(
  accountId: string,
  input: NewApiTokenInput,
): Promise<NewApiToken> {
  const account = await requireAccount(accountId)
  assertNewApiSite(account.siteType)
  return createToken(account.baseUrl, account.accessToken, account.userId, input)
}

/** 编辑 Token。 */
export async function updateKey(
  accountId: string,
  input: NewApiTokenInput & { id: number },
): Promise<void> {
  const account = await requireAccount(accountId)
  assertNewApiSite(account.siteType)
  await updateToken(account.baseUrl, account.accessToken, account.userId, input)
}

/** 删除 Token。 */
export async function deleteKey(
  accountId: string,
  tokenId: number,
): Promise<void> {
  const account = await requireAccount(accountId)
  assertNewApiSite(account.siteType)
  await deleteToken(account.baseUrl, account.accessToken, account.userId, tokenId)
}

/** 复制 Token key 到剪贴板。 */
export async function copyKey(key: string): Promise<void> {
  await navigator.clipboard.writeText(key)
}

/** 取 Token 真 key（列表里是掩码的）。 */
export async function revealKey(accountId: string, tokenId: number): Promise<string> {
  const account = await requireAccount(accountId)
  assertNewApiSite(account.siteType)
  return fetchTokenSecretKey(account.baseUrl, account.accessToken, account.userId, tokenId)
}

/** 取真 key 并复制到剪贴板。 */
export async function revealAndCopyKey(
  accountId: string,
  tokenId: number,
): Promise<string> {
  const key = await revealKey(accountId, tokenId)
  await copyKey(key)
  return key
}

/** 当前用户可用分组。 */
export async function listGroups(
  accountId: string,
): Promise<Record<string, NewApiUserGroup>> {
  const account = await requireAccount(accountId)
  assertNewApiSite(account.siteType)
  return fetchUserGroups(account.baseUrl, account.accessToken, account.userId)
}

/** 改 token 的分组（和模型限制）。 */
export async function updateKeyGroup(
  accountId: string,
  tokenId: number,
  patch: { group?: string; model_limits_enabled?: boolean; model_limits?: string },
): Promise<void> {
  const account = await requireAccount(accountId)
  assertNewApiSite(account.siteType)
  // PUT 要带完整 tokenData，先读原 token 再覆盖。
  const tokens = await fetchTokens(account.baseUrl, account.accessToken, account.userId)
  const existing = tokens.find((t) => t.id === tokenId)
  if (!existing) throw new Error("Token 不存在")
  const input: NewApiTokenInput & { id: number } = {
    id: tokenId,
    name: existing.name,
    remain_quota: existing.remain_quota,
    unlimited_quota: existing.unlimited_quota,
    expired_time: existing.expired_time,
    model_limits_enabled: patch.model_limits_enabled ?? existing.model_limits_enabled ?? false,
    model_limits: patch.model_limits ?? existing.model_limits ?? "",
    allow_ips: existing.allow_ips ?? "",
    group: patch.group ?? existing.group ?? "",
  }
  await updateToken(account.baseUrl, account.accessToken, account.userId, input)
}
