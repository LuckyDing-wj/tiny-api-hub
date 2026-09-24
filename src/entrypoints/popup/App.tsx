import {
  Archive,
  CalendarCheck,
  Database,
  Download,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Square,
} from "lucide-react"
import { useState } from "react"

import { importCurrentTabAccount } from "~/services/accounts"
import { loadAccounts } from "~/services/storage"
import { showToast } from "~/lib/toast"
import type { Account } from "~/types"

import AccountList from "./AccountList"
import AddAccountForm from "./AddAccountForm"
import SkeletonRows from "./SkeletonRows"
import BackupView from "./BackupView"
import CredentialView from "./CredentialView"
import ExportView from "./ExportView"
import KeyView from "./KeyView"
import ModelView from "./ModelView"
import ToastHost from "./ToastHost"
import VerifyView from "./VerifyView"
import { useAccounts } from "./useAccounts"
import { useCheckin } from "./useCheckin"
import { useRefreshAll } from "./useRefreshAll"

type Nav = "accounts" | "credentials" | "backup"

type View =
  | { kind: "main"; nav: Nav; adding: boolean }
  | { kind: "keys"; account: Account }
  | { kind: "models"; account: Account }
  | { kind: "verify"; from: Nav; baseUrl: string; apiKey: string; title: string }
  | { kind: "export"; from: Nav; name: string; baseUrl: string; apiKey: string; title: string }

const NAV_ITEMS: { id: Nav; label: string; icon: typeof KeyRound }[] = [
  { id: "accounts", label: "账号", icon: KeyRound },
  { id: "credentials", label: "凭据", icon: Database },
  { id: "backup", label: "备份", icon: Archive },
]

export default function App({ layout = "popup" }: { layout?: "popup" | "sidepanel" }) {
  const { accounts, loading, reloading, refreshOne, refreshingId } = useAccounts()
  const [view, setView] = useState<View>({ kind: "main", nav: "accounts", adding: false })
  const [importingTab, setImportingTab] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const {
    checkinResults,
    checkinProgress,
    checkinActive,
    checkinAll,
    stopCheckin,
    openFailedSites,
  } = useCheckin()
  const { refreshingAll, refreshProgress, refreshAll, stopRefreshAll } = useRefreshAll(
    refreshOne,
    reloading,
  )

  const backToMain = (nav: Nav = "accounts") =>
    setView({ kind: "main", nav, adding: false })

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
    try {
      await checkinAll()
    } finally {
      // 与原实现一致：签到抛错也重载账号列表
      await reloading()
    }
  }

  const handleOpenFailedSites = async () => {
    const count = await openFailedSites()
    if (count === 0) {
      showToast("今天没有签到失败的站点")
    }
  }

  // 全屏子视图：不套 main 布局，但保留 ToastHost（子视图内复制等操作要弹提示）
  const withToast = (node: React.ReactNode) => (
    <>
      {node}
      <ToastHost />
    </>
  )

  if (view.kind === "keys") {
    return withToast(
      <KeyView
        account={view.account}
        onBack={() => backToMain("accounts")}
        onVerify={(baseUrl, apiKey, title) =>
          setView({ kind: "verify", from: "accounts", baseUrl, apiKey, title })
        }
        onExport={(name, baseUrl, apiKey, title) =>
          setView({ kind: "export", from: "accounts", name, baseUrl, apiKey, title })
        }
      />,
    )
  }
  if (view.kind === "models") {
    return withToast(
      <ModelView
        account={view.account}
        onBack={() => backToMain("accounts")}
      />,
    )
  }
  if (view.kind === "export") {
    return withToast(
      <ExportView
        name={view.name}
        baseUrl={view.baseUrl}
        apiKey={view.apiKey}
        title={view.title}
        onBack={() => backToMain(view.from)}
      />,
    )
  }
  if (view.kind === "verify") {
    return withToast(
      <VerifyView
        baseUrl={view.baseUrl}
        apiKey={view.apiKey}
        title={view.title}
        onBack={() => backToMain(view.from)}
      />,
    )
  }

  // 主视图（底栏导航）
  const nav = view.nav
  const adding = view.adding

  return (
    <main
      className={
        layout === "sidepanel"
          ? "flex h-screen w-full flex-col overflow-hidden"
          : "flex h-[560px] w-[360px] flex-col overflow-hidden"
      }
    >
      <ToastHost />

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
                onClick={stopCheckin}
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
            refreshingAll ? (
              <button
                className="ta-btn ta-btn-icon"
                onClick={stopRefreshAll}
                title="停止刷新"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className="ta-btn ta-btn-icon"
                onClick={() => void refreshAll()}
                title="刷新全部"
              >
                <RefreshCw size={15} className={refreshingAll ? "spin" : ""} />
              </button>
            )
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
        <div key={nav} className="ta-view flex min-h-0 flex-col gap-2">
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
                <SkeletonRows rowClassName="h-24" />
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
                setView({ kind: "verify", from: "credentials", baseUrl, apiKey, title })
              }
              onExport={(name, baseUrl, apiKey, title) =>
                setView({ kind: "export", from: "credentials", name, baseUrl, apiKey, title })
              }
            />
          ) : nav === "backup" ? (
            <BackupView
              onBack={() => backToMain("accounts")}
              onImported={() => void reloading()}
            />
          ) : null}
        </div>
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
