import {
  Archive,
  CalendarCheck,
  Download,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Square,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { importCurrentTabAccount } from "~/services/accounts"
import { checkInAll, loadCheckInResults, type CheckInResult } from "~/services/checkin"
import { loadAccounts } from "~/services/storage"
import type { Account } from "~/types"

import AccountList from "./AccountList"
import AddAccountForm from "./AddAccountForm"
import BackupView from "./BackupView"
import CredentialView from "./CredentialView"
import ExportView from "./ExportView"
import KeyView from "./KeyView"
import ModelView from "./ModelView"
import VerifyView from "./VerifyView"
import { useAccounts } from "./useAccounts"

type Nav = "accounts" | "credentials" | "backup"

type View =
  | { kind: "main"; nav: Nav; adding: boolean }
  | { kind: "keys"; account: Account }
  | { kind: "models"; account: Account }
  | { kind: "verify"; baseUrl: string; apiKey: string; title: string }
  | { kind: "export"; name: string; baseUrl: string; apiKey: string; title: string }

const NAV_ITEMS: { id: Nav; label: string; icon: typeof KeyRound }[] = [
  { id: "accounts", label: "账号", icon: KeyRound },
  { id: "credentials", label: "凭据", icon: KeyRound },
  { id: "backup", label: "备份", icon: Archive },
]

export default function App() {
  const { accounts, loading, reloading, refreshOne, refreshingId } = useAccounts()
  const [view, setView] = useState<View>({ kind: "main", nav: "accounts", adding: false })
  const [importingTab, setImportingTab] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState<Record<string, "running" | "done">>({})
  const [checkinResults, setCheckinResults] = useState<Record<string, CheckInResult>>({})
  const [checkinRunning, setCheckinRunning] = useState<string | null>(null)
  const [checkinProgress, setCheckinProgress] = useState<Record<string, { status: "running" | "done"; result?: CheckInResult }>>({})
  const stopRef = useRef(false)

  useEffect(() => {
    void loadCheckInResults().then(setCheckinResults)
  }, [])

  const backToMain = (nav: Nav = "accounts") =>
    setView({ kind: "main", nav, adding: false })

  const handleRefreshAll = async () => {
    setRefreshingAll(true)
    setRefreshProgress({})
    try {
      const all = await loadAccounts()
      const enabled = all.filter((a) => !a.disabled)
      for (const account of enabled) {
        setRefreshProgress((prev) => ({ ...prev, [account.id]: "running" }))
        await refreshOne(account.id)
        setRefreshProgress((prev) => ({ ...prev, [account.id]: "done" }))
      }
      await reloading()
    } finally {
      setRefreshingAll(false)
      setTimeout(() => setRefreshProgress({}), 2000)
    }
  }

  const handleImportCurrentTab = async () => {
    setImportError(null)
    setImportingTab(true)
    try {
      await importCurrentTabAccount()
      await reloading()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImportingTab(false)
    }
  }

  const handleCheckinAll = async () => {
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
      const results = await loadCheckInResults()
      setCheckinResults(results)
    } finally {
      setCheckinRunning(null)
      await reloading()
    }
  }

  const handleStopCheckin = () => {
    stopRef.current = true
  }

  const handleOpenFailedSites = async () => {
    const results = await loadCheckInResults()
    const all = await loadAccounts()
    const today = new Date().toDateString()
    const failed = all.filter((a) => {
      const r = results[a.id]
      return (
        r &&
        !r.success &&
        new Date(r.timestamp).toDateString() === today
      )
    })
    for (const account of failed) {
      void chrome.tabs.create({ url: account.baseUrl })
    }
    if (failed.length === 0) {
      alert("今天没有签到失败的站点")
    }
  }

  // 全屏子视图
  if (view.kind === "keys") {
    return (
      <KeyView
        account={view.account}
        onBack={() => backToMain("accounts")}
        onVerify={(baseUrl, apiKey, title) =>
          setView({ kind: "verify", baseUrl, apiKey, title })
        }
        onExport={(name, baseUrl, apiKey, title) =>
          setView({ kind: "export", name, baseUrl, apiKey, title })
        }
      />
    )
  }
  if (view.kind === "models") {
    return (
      <ModelView
        account={view.account}
        onBack={() => backToMain("accounts")}
      />
    )
  }
  if (view.kind === "export") {
    return (
      <ExportView
        name={view.name}
        baseUrl={view.baseUrl}
        apiKey={view.apiKey}
        title={view.title}
        onBack={() => backToMain("accounts")}
      />
    )
  }
  if (view.kind === "verify") {
    return (
      <VerifyView
        baseUrl={view.baseUrl}
        apiKey={view.apiKey}
        title={view.title}
        onBack={() => backToMain("accounts")}
      />
    )
  }

  // 主视图（底栏导航）
  const nav = view.nav
  const adding = view.adding
  const checkinActive = checkinRunning !== null || Object.keys(checkinProgress).length > 0

  return (
    <main className="flex h-[560px] w-[360px] flex-col overflow-hidden">
      {/* 标题栏 */}
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <h1 className="text-sm font-semibold">Tiny API Hub</h1>
        <div className="flex items-center gap-1">
          {nav === "accounts" && (
            <button
              className="ta-btn ta-btn-icon"
              onClick={() => void handleImportCurrentTab()}
              disabled={importingTab}
              title="导入当前标签页"
            >
              <Download size={15} className={importingTab ? "spin" : ""} />
            </button>
          )}
          {nav === "accounts" && (
            checkinActive ? (
              <button
                className="ta-btn ta-btn-icon"
                onClick={handleStopCheckin}
                title="停止签到"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className="ta-btn ta-btn-icon"
                onClick={() => void handleCheckinAll()}
                title="全部签到"
              >
                <CalendarCheck size={15} />
              </button>
            )
          )}
          {nav === "accounts" && !checkinActive && (
            <button
              className="ta-btn ta-btn-icon"
              onClick={() => void handleOpenFailedSites()}
              title="打开今天签到失败的站点"
            >
              <ExternalLink size={15} />
            </button>
          )}
          {(nav === "accounts" || nav === "credentials") && (
            <button
              className="ta-btn ta-btn-icon"
              onClick={() => void handleRefreshAll()}
              disabled={refreshingAll}
              title="刷新全部"
            >
              <RefreshCw size={15} className={refreshingAll ? "spin" : ""} />
            </button>
          )}
          {(nav === "accounts" || nav === "credentials") && (
            <button
              className="ta-btn ta-btn-icon ta-btn-primary"
              onClick={() => setView({ kind: "main", nav, adding: true })}
              title={nav === "accounts" ? "添加账号" : "添加凭据"}
            >
              <Plus size={15} />
            </button>
          )}
        </div>
      </header>

      {/* 内容区 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-3 pb-2">
        {nav === "accounts" ? (
          <>
            {importError && (
              <p className="text-[11px] text-red-500 dark:text-red-400">{importError}</p>
            )}
            {adding && (
              <AddAccountForm
                onCreated={() => {
                  setView({ kind: "main", nav: "accounts", adding: false })
                  void reloading()
                }}
                onCancel={() => setView({ kind: "main", nav: "accounts", adding: false })}
              />
            )}
            {loading ? (
              <p className="py-4 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
                加载中...
              </p>
            ) : (
              <AccountList
                accounts={accounts}
                refreshingId={refreshingId}
                refreshProgress={refreshProgress}
                checkinProgress={checkinProgress}
                checkinResults={checkinResults}
                onRefresh={refreshOne}
                onChanged={reloading}
                onOpenKeys={(account) => setView({ kind: "keys", account })}
                onOpenModels={(account) => setView({ kind: "models", account })}
              />
            )}
          </>
        ) : nav === "credentials" ? (
          <CredentialView
            onChanged={reloading}
            onVerify={(baseUrl, apiKey, title) =>
              setView({ kind: "verify", baseUrl, apiKey, title })
            }
            onExport={(name, baseUrl, apiKey, title) =>
              setView({ kind: "export", name, baseUrl, apiKey, title })
            }
          />
        ) : nav === "backup" ? (
          <BackupView
            onBack={() => backToMain("accounts")}
            onImported={() => void reloading()}
          />
        ) : null}
      </div>

      {/* 底栏导航 */}
      <nav className="flex items-stretch border-t border-gray-200 dark:border-dark-bg-tertiary">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = nav === item.id
          return (
            <button
              key={item.id}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active
                  ? "text-blue-500 dark:text-blue-400"
                  : "text-gray-400 hover:text-gray-600 dark:text-dark-text-tertiary dark:hover:text-dark-text-secondary"
              }`}
              onClick={() => setView({ kind: "main", nav: item.id, adding: false })}
            >
              <Icon size={16} />
              {item.label}
            </button>
          )
        })}
      </nav>
    </main>
  )
}
