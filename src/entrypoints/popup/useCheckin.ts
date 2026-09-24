import { useCallback, useEffect, useRef, useState } from "react"

import { checkInAll, loadCheckInResults, type CheckInResult } from "~/services/checkin"
import { loadAccounts } from "~/services/storage"

export type CheckinProgress = Record<string, { status: "running" | "done"; result?: CheckInResult }>

/** 批量签到状态与操作。签到中途可停止；结果持久化由 service 层负责。 */
export function useCheckin() {
  const [checkinResults, setCheckinResults] = useState<Record<string, CheckInResult>>({})
  const [checkinRunning, setCheckinRunning] = useState<string | null>(null)
  const [checkinProgress, setCheckinProgress] = useState<CheckinProgress>({})
  const stopRef = useRef(false)

  useEffect(() => {
    void loadCheckInResults().then(setCheckinResults)
  }, [])

  const checkinAll = useCallback(async () => {
    stopRef.current = false
    setCheckinProgress({})
    setCheckinRunning("start")
    try {
      await checkInAll(
        (accountId, status, result) => {
          setCheckinProgress((prev) => ({
            ...prev,
            [accountId]: { status, result },
          }))
          setCheckinRunning(status === "running" ? accountId : null)
        },
        () => stopRef.current,
      )
      setCheckinResults(await loadCheckInResults())
    } finally {
      setCheckinRunning(null)
    }
  }, [])

  const stopCheckin = useCallback(() => {
    stopRef.current = true
  }, [])

  /** 打开今天签到失败的站点，返回失败数量（0 时调用方提示）。 */
  const openFailedSites = useCallback(async () => {
    const results = await loadCheckInResults()
    const all = await loadAccounts()
    const today = new Date().toDateString()
    const failed = all.filter((a) => {
      const r = results[a.id]
      return r && !r.success && new Date(r.timestamp).toDateString() === today
    })
    for (const account of failed) {
      void chrome.tabs.create({ url: account.baseUrl })
    }
    return failed.length
  }, [])

  const checkinActive = checkinRunning !== null || Object.keys(checkinProgress).length > 0

  return {
    checkinResults,
    checkinRunning,
    checkinProgress,
    checkinActive,
    checkinAll,
    stopCheckin,
    openFailedSites,
  }
}
