import { assertNewApiSite, loadAccounts, requireAccount } from "~/services/storage"
import { checkIn, fetchCheckInStatus, NewApiError } from "~/services/newApi"

const CHECKIN_RESULT_KEY = "tiny_api_hub_checkin_results_v1"

export interface CheckInResult {
  accountId: string
  accountName: string
  success: boolean
  message: string
  checkedInToday: boolean
  timestamp: number
}

/** 单账号签到。 */
export async function checkInAccount(accountId: string): Promise<CheckInResult> {
  const account = await requireAccount(accountId)
  assertNewApiSite(account.siteType)

  const timestamp = Date.now()

  // 先查状态：是否支持、是否今日已签
  let status: { enabled: boolean; checkedInToday: boolean } | null = null
  try {
    status = await fetchCheckInStatus(
      account.baseUrl,
      account.accessToken,
      account.userId,
    )
  } catch (err) {
    // 状态查询失败，仍尝试签到
    console.warn("[tiny-api-hub] checkin status fetch failed", err)
  }

  if (status && !status.enabled) {
    return {
      accountId: account.id,
      accountName: account.name,
      success: false,
      message: "站点未启用签到",
      checkedInToday: false,
      timestamp,
    }
  }

  if (status?.checkedInToday) {
    return {
      accountId: account.id,
      accountName: account.name,
      success: true,
      message: "今日已签到",
      checkedInToday: true,
      timestamp,
    }
  }

  try {
    const result = await checkIn(
      account.baseUrl,
      account.accessToken,
      account.userId,
    )
    return {
      accountId: account.id,
      accountName: account.name,
      success: result.success,
      message: result.message,
      checkedInToday: result.success,
      timestamp,
    }
  } catch (err) {
    const message =
      err instanceof NewApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err)
    return {
      accountId: account.id,
      accountName: account.name,
      success: false,
      message,
      checkedInToday: false,
      timestamp,
    }
  }
}

/** 全部启用账号串行签到，带进度回调。 */
export async function checkInAll(
  onProgress?: (accountId: string, status: "running" | "done", result?: CheckInResult) => void,
  shouldStop?: () => boolean,
): Promise<CheckInResult[]> {
  const accounts = await loadAccounts()
  const enabled = accounts.filter((a) => !a.disabled && a.siteType === "new-api")
  const results: CheckInResult[] = []
  for (const account of enabled) {
    if (shouldStop?.()) break
    onProgress?.(account.id, "running")
    const result = await checkInAccount(account.id)
    results.push(result)
    onProgress?.(account.id, "done", result)
    if (shouldStop?.()) break
    // 串行间隔，防限流
    if (enabled.indexOf(account) < enabled.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  await saveCheckInResults(results)
  return results
}

/** 最近一次签到结果（按账号 id 索引）。 */
export async function loadCheckInResults(): Promise<Record<string, CheckInResult>> {
  const res = await chrome.storage.local.get(CHECKIN_RESULT_KEY)
  const value = res[CHECKIN_RESULT_KEY]
  if (value && typeof value === "object") {
    return value as Record<string, CheckInResult>
  }
  return {}
}

async function saveCheckInResults(results: CheckInResult[]): Promise<void> {
  const existing = await loadCheckInResults()
  for (const r of results) {
    existing[r.accountId] = r
  }
  await chrome.storage.local.set({ [CHECKIN_RESULT_KEY]: existing })
}
