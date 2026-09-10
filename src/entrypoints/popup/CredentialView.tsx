import { Activity, CheckCircle2, Download, KeyRound, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

import {
  createCredential,
  loadCredentials,
  removeCredential,
  verifyCredential,
} from "~/services/credentials"
import type { Credential } from "~/services/credentials"

interface Props {
  onChanged: () => void
  onVerify: (baseUrl: string, apiKey: string, title: string) => void
  onExport: (name: string, baseUrl: string, apiKey: string, title: string) => void
}

function formatTime(ts: number | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString()
}

export default function CredentialView({ onChanged, onVerify, onExport }: Props) {
  const [creds, setCreds] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setCreds(await loadCredentials())
  }

  useEffect(() => {
    void (async () => {
      await reload()
      setLoading(false)
    })()
  }, [])

  const handleVerify = async (id: string) => {
    setVerifyingId(id)
    setError(null)
    try {
      await verifyCredential(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerifyingId(null)
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm("删除该凭据？")) return
    await removeCredential(id)
    await reload()
    onChanged()
  }

  return (
    <section className="flex flex-col gap-2.5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 text-sm font-semibold">
          <KeyRound size={14} /> 凭据库
        </h2>
        <button
          className="ta-btn ta-btn-primary"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={14} /> 添加
        </button>
      </header>

      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>
      )}

      {adding && (
        <AddCredentialForm
          onCreated={async () => {
            setAdding(false)
            await reload()
            onChanged()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading ? (
        <p className="py-4 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
          加载中...
        </p>
      ) : creds.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
          还没有凭据，点「添加」开始。
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {creds.map((cred) => (
            <li key={cred.id} className="ta-card flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">
                  {cred.name}
                </span>
                <span
                  className={`text-[10px] font-medium ${
                    cred.lastVerified === "ok"
                      ? "text-emerald-500 dark:text-emerald-400"
                      : cred.lastVerified === "fail"
                        ? "text-red-500 dark:text-red-400"
                        : "text-gray-400"
                  }`}
                >
                  {cred.lastVerified === "ok"
                    ? "可用"
                    : cred.lastVerified === "fail"
                      ? "失败"
                      : "未验证"}
                </span>
              </div>
              <code className="block w-full overflow-hidden text-ellipsis whitespace-pre-wrap break-all rounded bg-gray-100 px-1.5 py-1 font-mono text-[10px] text-gray-500 dark:bg-dark-bg-primary dark:text-dark-text-tertiary">
                {cred.baseUrl}
              </code>
              <code className="block w-full overflow-hidden text-ellipsis whitespace-pre-wrap break-all rounded bg-gray-100 px-1.5 py-1 font-mono text-[10px] text-gray-500 dark:bg-dark-bg-primary dark:text-dark-text-tertiary">
                {cred.apiKey.slice(0, 8)}••••••••{cred.apiKey.slice(-4)}
              </code>
              {cred.lastVerifiedError && (
                <p className="text-[10px] text-red-500 break-words dark:text-red-400">
                  {cred.lastVerifiedError}
                </p>
              )}
              <div className="flex justify-between text-[10px] text-gray-500 dark:text-dark-text-tertiary">
                <span>{formatTime(cred.lastVerifiedTime)}</span>
              </div>
              <div className="flex justify-end gap-1">
                <button
                  className="ta-btn ta-btn-icon"
                  onClick={() =>
                    onExport(cred.name, cred.baseUrl, cred.apiKey, cred.name)
                  }
                  title="导出"
                >
                  <Download size={14} />
                </button>
                <button
                  className="ta-btn ta-btn-icon"
                  onClick={() =>
                    onVerify(cred.baseUrl, cred.apiKey, cred.name)
                  }
                  title="验证"
                >
                  <Activity size={14} />
                </button>
                <button
                  className="ta-btn ta-btn-icon"
                  onClick={() => handleVerify(cred.id)}
                  disabled={verifyingId === cred.id}
                  title="测连通"
                >
                  {verifyingId === cred.id ? (
                    "···"
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                </button>
                <button
                  className="ta-btn ta-btn-danger"
                  onClick={() => handleRemove(cred.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddCredentialForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await createCredential({ name, baseUrl, apiKey })
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
        站点地址
        <input
          className="ta-input"
          type="url"
          placeholder="https://example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
        />
      </label>
      <label className="ta-label">
        API Key
        <input
          className="ta-input"
          type="password"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required
        />
      </label>
      <label className="ta-label">
        备注（可选）
        <input
          className="ta-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <button className="ta-btn ta-btn-primary" type="submit" disabled={submitting}>
          {submitting ? "添加中..." : "添加"}
        </button>
        <button className="ta-btn" type="button" onClick={onCancel} disabled={submitting}>
          取消
        </button>
      </div>
    </form>
  )
}
