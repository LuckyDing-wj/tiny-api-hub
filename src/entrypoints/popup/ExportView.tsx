import { Download } from "lucide-react"
import { useState } from "react"

import {
  CCSWITCH_APPS,
  buildCCSwitchUrl,
  type CCSwitchApp,
} from "~/services/export"

interface Props {
  name: string
  baseUrl: string
  apiKey: string
  title?: string
  onBack: () => void
}

export default function ExportView({
  name,
  baseUrl,
  apiKey,
  title,
  onBack,
}: Props) {
  const [ccApp, setCcApp] = useState<CCSwitchApp>("claude")
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ccUrl, setCcUrl] = useState<string | null>(null)

  const handleCCSwitch = () => {
    setError(null)
    try {
      const url = buildCCSwitchUrl({
        name,
        baseUrl,
        apiKey,
        ccSwitchApp: ccApp,
      })
      setCcUrl(url)
      const a = document.createElement("a")
      a.href = url
      a.rel = "noreferrer"
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCopyCcUrl = async () => {
    if (!ccUrl) return
    await navigator.clipboard.writeText(ccUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="flex w-[360px] flex-col gap-2.5 p-3">
      <header className="flex items-center gap-2">
        <button className="ta-btn ta-btn-icon" onClick={onBack} title="返回">
          ←
        </button>
        <h2 className="flex flex-1 items-center gap-1 overflow-hidden text-sm font-semibold">
          <Download size={14} />
          <span className="truncate">{title ?? "导出到 CC Switch"}</span>
        </h2>
      </header>

      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>
      )}

      <div className="ta-card flex flex-col gap-2">
        <p className="text-[10px] text-gray-500 dark:text-dark-text-tertiary">
          扩展里自定义协议经常被 Chrome 拦。点「打开」没反应时，复制 deeplink
          到浏览器地址栏回车。
        </p>
        <label className="ta-label">
          目标应用
          <select
            className="ta-input"
            value={ccApp}
            onChange={(e) => setCcApp(e.target.value as CCSwitchApp)}
          >
            {CCSWITCH_APPS.map((app) => (
              <option key={app} value={app}>
                {app}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1.5">
          <button className="ta-btn ta-btn-primary flex-1" onClick={handleCCSwitch}>
            打开 CC Switch
          </button>
          {ccUrl && (
            <button className="ta-btn" onClick={handleCopyCcUrl}>
              {copied ? "已复制 ✓" : "复制链接"}
            </button>
          )}
        </div>
        {ccUrl && (
          <code className="break-all rounded bg-gray-100 px-1.5 py-1 font-mono text-[10px] text-gray-500 dark:bg-dark-bg-primary dark:text-dark-text-tertiary">
            {ccUrl}
          </code>
        )}
      </div>
    </section>
  )
}
