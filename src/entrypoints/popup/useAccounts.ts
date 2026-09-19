import { useCallback, useEffect, useState } from "react"

import { loadAccounts } from "~/services/storage"
import { refreshAccount } from "~/services/accounts"
import type { Account } from "~/types"

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setAccounts(await loadAccounts())
  }, [])

  useEffect(() => {
    void (async () => {
      await reload()
      setLoading(false)
    })()
  }, [reload])

  const refreshOne = useCallback(
    async (id: string) => {
      setRefreshingId(id)
      try {
        await refreshAccount(id)
        await reload()
      } finally {
        setRefreshingId((current) => (current === id ? null : current))
      }
    },
    [reload],
  )

  return { accounts, loading, reloading: reload, refreshOne, refreshingId }
}
