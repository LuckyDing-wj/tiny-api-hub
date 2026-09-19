import { Activity, Copy, Download, KeyRound, Plus, Tag } from "lucide-react"
import { useEffect, useState } from "react"

import ConfirmButton, { CONFIRM_ARMED_CLASS } from "./ConfirmButton"

import {
  copyKey,
  createKey,
  deleteKey,
  listGroups,
  listTokens,
  revealAndCopyKey,
  revealKey,
  updateKeyGroup,
} from "~/services/keys"
import { listGroupModels } from "~/services/models"
import { QUOTA_PER_USD, quotaToBalance } from "~/services/newApi"
import type { Account } from "~/types"
import type { NewApiToken, NewApiTokenInput, NewApiUserGroup } from "~/services/newApi"

interface Props {
  account: Account
  onBack: () => void
  onVerify: (baseUrl: string, apiKey: string, title: string) => void
  onExport: (name: string, baseUrl: string, apiKey: string, title: string) => void
}

function formatQuota(token: NewApiToken): string {
  if (token.unlimited_quota) return "无限"
  const remain = quotaToBalance(token.remain_quota ?? 0)
  const used = quotaToBalance(token.used_quota ?? 0)
  return `${remain.toFixed(2)} / 用 ${used.toFixed(2)}`
}

function formatExpiry(ts: number): string {
  if (!ts || ts <= 0) return "永久"
  return new Date(ts * 1000).toLocaleDateString()
}

interface GroupOption {
  key: string
  label: string
  ratio?: number
}

function groupOptions(groups: Record<string, NewApiUserGroup>): GroupOption[] {
  return Object.entries(groups).map(([key, g]) => ({
    key,
    label: key,
    ratio: typeof g.ratio === "number" ? g.ratio : undefined,
  }))
}

export default function KeyView({ account, onBack, onVerify, onExport }: Props) {
  const [tokens, setTokens] = useState<NewApiToken[]>([])
  const [groups, setGroups] = useState<Record<string, NewApiUserGroup>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [copyingId, setCopyingId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [viewingGroup, setViewingGroup] = useState<string | null>(null)
  const [groupModels, setGroupModels] = useState<string[]>([])
  const [loadingGroupModels, setLoadingGroupModels] = useState(false)
  const [editingGroupFor, setEditingGroupFor] = useState<number | null>(null)
  const [editGroupValue, setEditGroupValue] = useState("")

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const [t, g] = await Promise.all([
        listTokens(account.id),
        listGroups(account.id).catch(() => ({})),
      ])
      setTokens(t)
      setGroups(g)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id])

  const handleCopy = async (token: NewApiToken) => {
    setCopyingId(token.id)
    setCopiedId(null)
    try {
      await revealAndCopyKey(account.id, token.id)
      setCopiedId(token.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCopyingId(null)
    }
  }

  const handleDelete = async (tokenId: number) => {
    try {
      await deleteKey(account.id, tokenId)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleEditGroup = async (tokenId: number) => {
    if (!editGroupValue) return
    try {
      await updateKeyGroup(account.id, tokenId, { group: editGroupValue })
      setEditingGroupFor(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const options = groupOptions(groups)

  return (
    <section className="ta-view flex h-[560px] w-[360px] flex-col gap-2.5 overflow-hidden p-3">
      <header className="flex items-center gap-2">
        <button className="ta-btn ta-btn-icon" onClick={onBack} title="返回">
          ←
        </button>
        <h2 className="flex flex-1 items-center gap-1 overflow-hidden text-sm font-semibold">
          <KeyRound size={14} />
          <span className="truncate">{account.name}</span>
        </h2>
        <button
          className="ta-btn ta-btn-primary"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus size={14} /> 新建
        </button>
      </header>

      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>
      )}

      {showCreate && (
        <CreateTokenForm
          groups={options}
          onCreated={async () => {
            setShowCreate(false)
            await reload()
          }}
          onCancel={() => setShowCreate(false)}
          onCreate={(input) => createKey(account.id, input)}
        />
      )}

      {options.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="flex items-center gap-0.5 text-[10px] text-gray-500 dark:text-dark-text-tertiary">
            <Tag size={11} /> 分组
          </span>
          {options.map((g) => (
            <button
              key={g.key}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                viewingGroup === g.key
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-600 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary"
              }`}
              onClick={async () => {
                if (viewingGroup === g.key) {
                  setViewingGroup(null)
                  setGroupModels([])
                  return
                }
                setViewingGroup(g.key)
                setGroupModels([])
                setLoadingGroupModels(true)
                try {
                  setGroupModels(await listGroupModels(account.id, g.key))
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                } finally {
                  setLoadingGroupModels(false)
                }
              }}
              title={`倍率 ${g.ratio ?? "?"}`}
            >
              {g.key}
              {g.ratio != null && ` ×${g.ratio}`}
            </button>
          ))}
        </div>
      )}

      {viewingGroup && (
        <GroupModelsCard
          groupName={viewingGroup}
          models={groupModels}
          loading={loadingGroupModels}
          onClose={() => {
            setViewingGroup(null)
            setGroupModels([])
          }}
          onView={(modelName) => void navigator.clipboard.writeText(modelName)}
        />
      )}

      {loading ? (
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ta-skeleton h-16" />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
          还没有 Token，点「新建」创建。
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <ul className="flex flex-col gap-1.5">
            {tokens.map((token) => (
              <li key={token.id} className="ta-card flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">
                    {token.status === 1 ? "🟢 " : "🔴 "}
                    {token.name || "(未命名)"}
                  </span>
                  <span className="text-sm font-semibold text-emerald-500 dark:text-emerald-400">
                    {formatQuota(token)}
                  </span>
                </div>
                <code
                  className="break-all rounded bg-gray-100 px-1.5 py-1 font-mono text-[10px] text-gray-500 dark:bg-dark-bg-primary dark:text-dark-text-tertiary"
                  onClick={() => void copyKey(token.key)}
                  title="点击复制掩码 key"
                >
                  {token.key}
                </code>
                <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-dark-text-tertiary">
                  <span>到期：{formatExpiry(token.expired_time)}</span>
                  {token.group && (
                    <span className="rounded bg-gray-200 px-1 dark:bg-dark-bg-tertiary">
                      {token.group}
                    </span>
                  )}
                </div>
                {editingGroupFor === token.id ? (
                  <div className="flex items-center gap-1">
                    <select
                      className="ta-input flex-1"
                      value={editGroupValue}
                      onChange={(e) => setEditGroupValue(e.target.value)}
                    >
                      <option value="">默认（跟随账号）</option>
                      {options.map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.key}
                          {g.ratio != null ? ` (×${g.ratio})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      className="ta-btn ta-btn-primary"
                      onClick={() => void handleEditGroup(token.id)}
                      title="保存分组"
                    >
                      ✓
                    </button>
                    <button
                      className="ta-btn"
                      onClick={() => setEditingGroupFor(null)}
                      title="取消"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-1">
                    <button
                      className="ta-btn ta-btn-icon"
                      onClick={() => {
                        setEditingGroupFor(token.id)
                        setEditGroupValue(token.group ?? "")
                      }}
                      title="改分组"
                    >
                      <Tag size={13} />
                    </button>
                    <button
                      className="ta-btn ta-btn-icon"
                      onClick={async () => {
                        try {
                          const key = await revealKey(account.id, token.id)
                          onExport(
                            token.name || account.name,
                            account.baseUrl,
                            key,
                            `${account.name} / ${token.name}`,
                          )
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
                        }
                      }}
                      title="导出"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      className="ta-btn ta-btn-icon"
                      onClick={async () => {
                        try {
                          const key = await revealKey(account.id, token.id)
                          onVerify(account.baseUrl, key, `${account.name} / ${token.name}`)
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
                        }
                      }}
                      title="验证"
                    >
                      <Activity size={14} />
                    </button>
                    <button
                      className="ta-btn ta-btn-icon"
                      onClick={() => handleCopy(token)}
                      disabled={copyingId === token.id}
                      title="复制真 Key"
                    >
                      {copiedId === token.id ? "✓" : <Copy size={14} />}
                    </button>
                    <ConfirmButton
                      className="ta-btn ta-btn-danger"
                      armedClassName={CONFIRM_ARMED_CLASS}
                      onConfirm={() => handleDelete(token.id)}
                    >
                      删除
                    </ConfirmButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function CreateTokenForm({
  groups,
  onCreated,
  onCancel,
  onCreate,
}: {
  groups: GroupOption[]
  onCreated: () => void
  onCancel: () => void
  onCreate: (input: NewApiTokenInput) => Promise<NewApiToken>
}) {
  const [name, setName] = useState("")
  const [group, setGroup] = useState("")
  const [unlimited, setUnlimited] = useState(true)
  const [quota, setQuota] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const remainQuota = unlimited
        ? 0
        : Math.max(0, Math.floor(Number(quota) * QUOTA_PER_USD))
      await onCreate({
        name: name.trim() || "Tiny API Hub",
        remain_quota: remainQuota,
        unlimited_quota: unlimited,
        ...(group ? { group } : {}),
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="ta-card flex flex-col gap-2" onSubmit={handleSubmit}>
      <label className="ta-label">
        名称
        <input
          className="ta-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tiny API Hub"
        />
      </label>
      {groups.length > 0 && (
        <label className="ta-label">
          分组
          <select
            className="ta-input"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">默认（跟随账号）</option>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key}
                {g.ratio != null ? ` (×${g.ratio})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => setUnlimited(e.target.checked)}
        />
        无限额度
      </label>
      {!unlimited && (
        <label className="ta-label">
          额度（USD）
          <input
            className="ta-input"
            type="number"
            step="0.01"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            placeholder="10"
          />
        </label>
      )}
      {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <button className="ta-btn ta-btn-primary" type="submit" disabled={submitting}>
          {submitting ? "创建中..." : "创建"}
        </button>
        <button className="ta-btn" type="button" onClick={onCancel} disabled={submitting}>
          取消
        </button>
      </div>
    </form>
  )
}

function GroupModelsCard({
  groupName,
  models,
  loading,
  onClose,
  onView,
}: {
  groupName: string
  models: string[]
  loading: boolean
  onClose: () => void
  onView: (modelName: string) => void
}) {
  return (
    <div className="ta-card flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          分组「{groupName}」可用模型
          {!loading && `（${models.length}）`}
        </span>
        <button className="text-[10px] text-gray-400" onClick={onClose}>
          ✕
        </button>
      </div>
      {loading ? (
        <p className="py-2 text-center text-[10px] text-gray-500 dark:text-dark-text-tertiary">
          查询中...
        </p>
      ) : models.length === 0 ? (
        <p className="py-2 text-center text-[10px] text-gray-400">
          pricing 表里没有标这个分组的模型
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {models.map((m) => (
              <li
                key={m}
                className="flex items-center justify-between gap-1 rounded px-1 py-0.5 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
              >
                <span className="truncate font-mono text-[10px] text-gray-600 dark:text-dark-text-secondary">
                  {m}
                </span>
                <button
                  className="text-[10px] text-gray-400 hover:text-blue-500"
                  onClick={() => onView(m)}
                  title="复制模型名"
                >
                  ⧉
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
