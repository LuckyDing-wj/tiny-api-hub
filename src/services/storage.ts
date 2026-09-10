import type { Account } from "~/types"

// 账号存储。key 故意和 all-api-hub 区分，两扩展可共存。
const ACCOUNTS_KEY = "tiny_api_hub_accounts_v1"

export async function loadAccounts(): Promise<Account[]> {
  const result = await chrome.storage.local.get(ACCOUNTS_KEY)
  const value = result[ACCOUNTS_KEY]
  return Array.isArray(value) ? (value as Account[]) : []
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
  await chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts })
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const accounts = await loadAccounts()
  return accounts.find((a) => a.id === id)
}

export async function upsertAccount(account: Account): Promise<void> {
  const accounts = await loadAccounts()
  const idx = accounts.findIndex((a) => a.id === account.id)
  if (idx >= 0) {
    accounts[idx] = account
  } else {
    accounts.push(account)
  }
  await saveAccounts(accounts)
}

export async function removeAccount(id: string): Promise<void> {
  const accounts = await loadAccounts()
  await saveAccounts(accounts.filter((a) => a.id !== id))
}

export async function patchAccount(
  id: string,
  patch: Partial<Account>,
): Promise<Account | undefined> {
  const accounts = await loadAccounts()
  const idx = accounts.findIndex((a) => a.id === id)
  if (idx < 0) return undefined
  accounts[idx] = { ...accounts[idx], ...patch }
  await saveAccounts(accounts)
  return accounts[idx]
}

/** 下一个 order 值（追加到列表末尾）。 */
export async function nextOrder(): Promise<number> {
  const accounts = await loadAccounts()
  if (accounts.length === 0) return 0
  return Math.max(...accounts.map((a) => a.order)) + 1
}
