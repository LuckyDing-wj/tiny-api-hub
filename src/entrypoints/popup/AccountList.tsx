import { Cpu, KeyRound, RefreshCw, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { removeAccount } from "~/services/storage"
import type { CheckInResult } from "~/services/checkin"
import type { Account } from "~/types"

export interface CheckinState {
  status: "running" | "done"
  result?: CheckInResult
}

interface Props {
  accounts: Account[]
  refreshingId: string | null
  refreshProgress?: Record<string, "running" | "done">
  checkinProgress?: Record<string, CheckinState>
  checkinResults?: Record<string, CheckInResult>
  onRefresh: (id: string) => void
  onChanged: () => void
  onOpenKeys: (account: Account) => void
  onOpenModels: (account: Account) => void
}

function formatBalance(account: Account): string {
  return `$${(account.balance ?? 0).toFixed(2)}`
}

function formatTime(ts: number | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString()
}

export default function AccountList({
  accounts,
  refreshingId,
  refreshProgress,
  checkinProgress,
  checkinResults,
  onRefresh,
  onChanged,
  onOpenKeys,
  onOpenModels,
}: Props) {
  const [query, setQuery] = useState("")
  const sorted = useMemo(
    () =>
      [...accounts].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return a.order - b.order
      }),
    [accounts],
  )
  const filtered =
    query.trim()
      ? sorted.filter((a) => {
          const q = query.trim().toLowerCase()
          return (
            a.name.toLowerCase().includes(q) ||
            a.baseUrl.toLowerCase().includes(q) ||
            (a.note ?? "").toLowerCase().includes(q) ||
            (a.userId ?? "").toLowerCase().includes(q)
          )
        })
      : sorted

  if (accounts.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
        还没有账号，点「添加账号」开始。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-text-tertiary"
        />
        <input
          className="ta-input pl-7"
          placeholder="搜索名称 / 地址 / 备注"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 dark:text-dark-text-tertiary"
            onClick={() => setQuery("")}
          >
            ✕
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
          没有匹配「{query}」的账号。
        </p>
      ) : (
    <ul className="flex flex-col gap-1.5">
      {filtered.map((account) => (
        <li
          key={account.id}
          className={`ta-card flex flex-col gap-1 ${account.disabled ? "opacity-60" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <a
              href={account.baseUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              title={`打开 ${account.baseUrl}`}
            >
              {account.pinned && "📌 "}
              {account.name}
            </a>
            <span
              className={`text-sm font-semibold ${
                account.health === "error"
                  ? "text-red-500 dark:text-red-400"
                  : "text-emerald-500 dark:text-emerald-400"
              }`}
            >
              {formatBalance(account)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-dark-text-tertiary">
            <span>{formatTime(account.lastSyncTime)}</span>
            <div className="flex items-center gap-2">
              {refreshProgress?.[account.id] === "running" && (
                <span className="flex items-center gap-0.5 text-blue-500">
                  <RefreshCw size={10} className="spin" /> 刷新中
                </span>
              )}
              {checkinProgress?.[account.id] ? (
                <CheckinBadge state={checkinProgress[account.id]} />
              ) : checkinResults?.[account.id] ? (
                <CheckinHistoryBadge result={checkinResults[account.id]} />
              ) : null}
            </div>
          </div>
          {account.lastSyncError && (
            <p className="text-[10px] text-red-500 break-words dark:text-red-400">
              {account.lastSyncError}
            </p>
          )}
          <div className="flex justify-end gap-1">
            <button
              className="ta-btn ta-btn-icon"
              onClick={() => onOpenKeys(account)}
              title="密钥"
            >
              <KeyRound size={14} />
            </button>
            <button
              className="ta-btn ta-btn-icon"
              onClick={() => onOpenModels(account)}
              title="模型"
            >
              <Cpu size={14} />
            </button>
            <button
              className="ta-btn ta-btn-icon"
              onClick={() => onRefresh(account.id)}
              disabled={refreshingId === account.id}
              title="刷新"
            >
              <RefreshCw
                size={14}
                className={refreshingId === account.id ? "spin" : ""}
              />
            </button>
            <button
              className="ta-btn ta-btn-danger"
              onClick={async () => {
                await removeAccount(account.id)
                onChanged()
              }}
            >
              删除
            </button>
          </div>
        </li>
      ))}
    </ul>
      )}
    </div>
  )
}

function CheckinHistoryBadge({ result }: { result: CheckInResult }) {
  const isToday = new Date(result.timestamp).toDateString() === new Date().toDateString()
  if (result.success) {
    return (
      <span className="text-emerald-500 dark:text-emerald-400" title={result.message}>
        ✓ {isToday ? "今日已签" : "曾签到"}
      </span>
    )
  }
  return (
    <span className="text-red-500 dark:text-red-400" title={result.message}>
      ✕ {isToday ? "今日失败" : "上次失败"}
    </span>
  )
}

function CheckinBadge({ state }: { state: CheckinState }) {
  if (state.status === "running") {
    return (
      <span className="flex items-center gap-0.5 text-blue-500">
        <RefreshCw size={10} className="spin" /> 签到中
      </span>
    )
  }
  const r = state.result
  if (!r) return null
  if (r.success) {
    return (
      <span className="text-emerald-500 dark:text-emerald-400">
        ✓ {r.checkedInToday ? "已签到" : "成功"}
      </span>
    )
  }
  return (
    <span className="text-red-500 dark:text-red-400" title={r.message}>
      ✕ {r.message?.slice(0, 30) || "失败"}
    </span>
  )
}
