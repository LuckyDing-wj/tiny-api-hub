import { useCallback, useRef, useState } from "react"

import { loadAccounts } from "~/services/storage"

/** 全部账号串行刷新。可中途停止；进度按账号上报。 */
export function useRefreshAll(
  refreshOne: (id: string) => Promise<void>,
  reloading: () => Promise<void>,
) {
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState<Record<string, "running" | "done">>({})
  const stopRef = useRef(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopRefreshAll = useCallback(() => {
    stopRef.current = true
  }, [])

  const refreshAll = useCallback(async () => {
    stopRef.current = false
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    setRefreshingAll(true)
    setRefreshProgress({})
    try {
      const all = await loadAccounts()
      const enabled = all.filter((a) => !a.disabled)
      for (const account of enabled) {
        if (stopRef.current) break
        setRefreshProgress((prev) => ({ ...prev, [account.id]: "running" }))
        await refreshOne(account.id)
        setRefreshProgress((prev) => ({ ...prev, [account.id]: "done" }))
      }
      await reloading()
    } finally {
      setRefreshingAll(false)
      clearTimerRef.current = setTimeout(() => setRefreshProgress({}), 2000)
    }
  }, [refreshOne, reloading])

  return { refreshingAll, refreshProgress, refreshAll, stopRefreshAll }
}
