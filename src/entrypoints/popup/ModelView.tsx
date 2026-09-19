import { Cpu } from "lucide-react"
import { useEffect, useState } from "react"

import { getAccountModels } from "~/services/models"
import { formatPriceCompact } from "~/services/modelPricing"
import type { Account } from "~/types"
import type { ModelInfo } from "~/services/models"

import SkeletonRows from "./SkeletonRows"

interface Props {
  account: Account
  onBack: () => void
}

function formatPrice(price: number | undefined): string {
  if (price == null) return "—"
  return formatPriceCompact(price)
}

export default function ModelView({ account, onBack }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getAccountModels(account.id)
        setModels(data.models)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [account.id])

  const filtered = filter.trim()
    ? models.filter((m) =>
        m.name.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : models

  return (
    <section className="ta-view flex w-[360px] flex-col gap-2.5 p-3">
      <header className="flex items-center gap-2">
        <button className="ta-btn ta-btn-icon" onClick={onBack} title="返回">
          ←
        </button>
        <h2 className="flex flex-1 items-center gap-1 overflow-hidden text-sm font-semibold">
          <Cpu size={14} />
          <span className="truncate">{account.name}</span>
        </h2>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500 dark:bg-dark-bg-primary dark:text-dark-text-tertiary">
          {filtered.length}
        </span>
      </header>

      <input
        className="ta-input"
        type="text"
        placeholder="筛选模型..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <SkeletonRows rowClassName="h-16" />
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
          无模型{filter ? "匹配筛选" : "，该账号未返回模型列表"}。
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((model) => (
            <li key={model.id} className="ta-card flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium" title={model.name}>
                  {model.name}
                </span>
                <span className="text-sm font-semibold text-emerald-500 dark:text-emerald-400">
                  {formatPrice(model.inputPrice)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500 dark:text-dark-text-tertiary">
                <span>
                  出 {formatPrice(model.outputPrice)}
                  {model.cacheRead != null && ` · 缓存 ${formatPrice(model.cacheRead)}`}
                </span>
                <span>{model.billingMode ?? model.vendor ?? ""}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
