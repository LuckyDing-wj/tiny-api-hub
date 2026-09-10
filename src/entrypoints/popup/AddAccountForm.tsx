import { useState } from "react"

import { createAccount, importCurrentTabAccount } from "~/services/accounts"
import type { AccountInput } from "~/types"

interface Props {
  onCreated: () => void
  onCancel: () => void
}

export default function AddAccountForm({ onCreated, onCancel }: Props) {
  const [baseUrl, setBaseUrl] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [userId, setUserId] = useState("")
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const input: AccountInput = {
        name,
        baseUrl,
        siteType: "new-api",
        accessToken,
        userId: userId || undefined,
      }
      await createAccount(input)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleImportCurrentTab = async () => {
    setDetecting(true)
    setError(null)
    try {
      await importCurrentTabAccount()
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetecting(false)
    }
  }

  const busy = submitting || detecting

  return (
    <form className="ta-card flex flex-col gap-2" onSubmit={handleSubmit}>
      <button
        className="ta-btn ta-btn-primary"
        type="button"
        onClick={() => void handleImportCurrentTab()}
        disabled={busy}
      >
        {detecting ? "识别中..." : "导入当前标签页"}
      </button>
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
        Access Token
        <input
          className="ta-input"
          type="password"
          placeholder="sk-..."
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          required
        />
      </label>
      <label className="ta-label">
        用户 ID（可选）
        <input
          className="ta-input"
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
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
        <button className="ta-btn ta-btn-primary" type="submit" disabled={busy}>
          {submitting ? "验证中..." : "添加"}
        </button>
        <button className="ta-btn" type="button" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  )
}
