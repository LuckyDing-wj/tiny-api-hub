import { Archive, Download, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  BackupError,
  backupFilename,
  buildBackup,
  importBackup,
  parseBackup,
  serializeBackup,
  type BackupScope,
  type ImportMode,
  type ImportResult,
} from "~/services/backup"
import {
  DEFAULT_WEBDAV_CONFIG,
  downloadWebdavBackup,
  loadWebdavConfig,
  saveWebdavConfig,
  testWebdav,
  uploadWebdavBackup,
  WebdavError,
  type WebdavConfig,
} from "~/services/webdav"

interface Props {
  onBack: () => void
  onImported: () => void
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function BackupView({ onBack, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [scope, setScope] = useState<BackupScope>("all")
  const [mode, setMode] = useState<ImportMode>("merge")
  const [paste, setPaste] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [webdav, setWebdav] = useState<WebdavConfig>(DEFAULT_WEBDAV_CONFIG)

  useEffect(() => {
    void loadWebdavConfig().then(setWebdav)
  }, [])

  const reportImport = (imported: ImportResult, rejected: string[]) => {
    const parts = [
      `账号 ${imported.accountsImported}`,
      `凭据 ${imported.credentialsImported}`,
      imported.preferencesImported ? "偏好已写入" : "偏好跳过",
    ]
    if (rejected.length > 0) {
      parts.push(`跳过非 New API：${rejected.join(", ")}`)
    }
    setResult(`导入完成：${parts.join(" · ")}`)
    onImported()
  }

  const handleExport = async () => {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const backup = await buildBackup(scope)
      downloadText(backupFilename(scope, backup.timestamp), serializeBackup(backup))
      setResult("已下载备份文件")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCopyExport = async () => {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const backup = await buildBackup(scope)
      await navigator.clipboard.writeText(serializeBackup(backup))
      setResult("已复制 JSON 到剪贴板")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const runImport = async (json: string) => {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const parsed = parseBackup(json)
      const imported = await importBackup(json, mode)
      reportImport(imported, parsed.summary.rejectedSiteTypes)
    } catch (err) {
      setError(err instanceof BackupError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      await runImport(await file.text())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const patchWebdav = (patch: Partial<WebdavConfig>) => {
    setWebdav((prev) => ({ ...prev, ...patch }))
  }

  const handleSaveWebdav = async () => {
    setError(null)
    setResult(null)
    await saveWebdavConfig(webdav)
    setResult("已保存 WebDAV 配置")
  }

  const handleTestWebdav = async () => {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      await saveWebdavConfig(webdav)
      await testWebdav(webdav)
      setResult("WebDAV 连接成功")
    } catch (err) {
      setError(err instanceof WebdavError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleUploadWebdav = async () => {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      await saveWebdavConfig(webdav)
      const backup = await buildBackup("all")
      const url = await uploadWebdavBackup(webdav, serializeBackup(backup))
      setResult(`已上传：${url}`)
    } catch (err) {
      setError(err instanceof WebdavError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDownloadWebdav = async () => {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      await saveWebdavConfig(webdav)
      const json = await downloadWebdavBackup(webdav)
      const parsed = parseBackup(json)
      const imported = await importBackup(json, mode)
      reportImport(imported, parsed.summary.rejectedSiteTypes)
    } catch (err) {
      setError(
        err instanceof WebdavError || err instanceof BackupError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex max-h-[560px] w-[360px] flex-col gap-2.5 overflow-y-auto p-3">
      <header className="flex items-center gap-2">
        <button className="ta-btn ta-btn-icon" onClick={onBack} title="返回">
          ←
        </button>
        <h2 className="flex flex-1 items-center gap-1 text-sm font-semibold">
          <Archive size={14} /> 备份
        </h2>
      </header>

      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>
      )}
      {result && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{result}</p>
      )}

      <div className="ta-card flex flex-col gap-2">
        <select
          className="ta-input"
          value={scope}
          onChange={(e) => setScope(e.target.value as BackupScope)}
        >
          <option value="all">全部（账号 + 凭据 + 偏好）</option>
          <option value="accounts">仅账号</option>
          <option value="preferences">仅偏好</option>
        </select>
        <div className="flex gap-1.5">
          <button
            className="ta-btn ta-btn-primary flex-1"
            onClick={() => void handleExport()}
            disabled={busy}
          >
            <Download size={14} /> 下载 JSON
          </button>
          <button className="ta-btn" onClick={() => void handleCopyExport()} disabled={busy}>
            复制
          </button>
        </div>
      </div>

      <div className="ta-card flex flex-col gap-2">
        <select
          className="ta-input"
          value={mode}
          onChange={(e) => setMode(e.target.value as ImportMode)}
        >
          <option value="merge">合并（同 id 覆盖，其余保留）</option>
          <option value="replace">替换（导入段覆盖本地）</option>
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            void handleFile(file)
          }}
        />
        <button
          className="ta-btn"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload size={14} /> 选择 JSON 文件
        </button>
        <textarea
          className="ta-input min-h-24 font-mono"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder='{"kind":"tiny-api-hub", ...}'
        />
        <button
          className="ta-btn ta-btn-primary"
          onClick={() => void runImport(paste)}
          disabled={busy || !paste.trim()}
        >
          从粘贴导入
        </button>
      </div>

      <div className="ta-card flex flex-col gap-2">
        <input
          className="ta-input"
          type="url"
          placeholder="WebDAV 地址"
          value={webdav.url}
          onChange={(e) => patchWebdav({ url: e.target.value })}
        />
        <input
          className="ta-input"
          type="text"
          placeholder="用户名"
          value={webdav.username}
          onChange={(e) => patchWebdav({ username: e.target.value })}
          autoComplete="off"
        />
        <input
          className="ta-input"
          type="password"
          placeholder="密码"
          value={webdav.password}
          onChange={(e) => patchWebdav({ password: e.target.value })}
          autoComplete="off"
        />
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={webdav.encrypt}
            onChange={(e) => patchWebdav({ encrypt: e.target.checked })}
          />
          加密上传（AES-GCM）
        </label>
        {webdav.encrypt && (
          <input
            className="ta-input"
            type="password"
            placeholder="加密口令"
            value={webdav.passphrase}
            onChange={(e) => patchWebdav({ passphrase: e.target.value })}
            autoComplete="off"
          />
        )}
        <div className="flex flex-wrap gap-1.5">
          <button className="ta-btn" onClick={() => void handleSaveWebdav()} disabled={busy}>
            保存
          </button>
          <button className="ta-btn" onClick={() => void handleTestWebdav()} disabled={busy}>
            测试连接
          </button>
          <button className="ta-btn ta-btn-primary" onClick={() => void handleUploadWebdav()} disabled={busy}>
            上传
          </button>
          <button className="ta-btn ta-btn-primary" onClick={() => void handleDownloadWebdav()} disabled={busy}>
            下载并导入
          </button>
        </div>
      </div>
    </section>
  )
}
