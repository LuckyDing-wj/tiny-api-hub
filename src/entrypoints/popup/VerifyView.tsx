import { Activity, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { probeModels, probeTextGeneration } from "~/services/verify"
import type { ProbeResult } from "~/services/verify"

import { useFlash } from "./useFlash"

interface Props {
  baseUrl: string
  apiKey: string
  title?: string
  onBack: () => void
}

const BATCH_MAX = 10
const BATCH_INTERVAL_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface BatchRow {
  modelId: string
  result: ProbeResult | null
  running: boolean
}

export default function VerifyView({ baseUrl, apiKey, title, onBack }: Props) {
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<string[]>([])
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [batch, setBatch] = useState<BatchRow[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [filter, setFilter] = useState("")
  const [copiedMsg, flashCopied] = useFlash()
  const stopRef = useRef(false)

  const fetchModels = async () => {
    setLoading(true)
    setModelsError(null)
    setModels([])
    setSelected(new Set())
    setBatch([])
    try {
      const result = await probeModels({ baseUrl, apiKey })
      if (result.status === "pass" && result.modelIds) {
        setModels(result.modelIds)
      } else {
        setModelsError(result.summary || "获取模型失败")
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey])

  useEffect(() => () => { stopRef.current = true }, [])

  const filtered = useMemo(
    () =>
      filter.trim()
        ? models.filter((m) => m.toLowerCase().includes(filter.trim().toLowerCase()))
        : models,
    [models, filter],
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleVisible = () => {
    setSelected((prev) => {
      const allVisible = filtered.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allVisible) {
        filtered.forEach((id) => next.delete(id))
      } else {
        filtered.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const selectedList = useMemo(() => [...selected], [selected])

  const handleBatch = async () => {
    const list = selectedList
    if (list.length === 0 || list.length > BATCH_MAX) return
    setBatchRunning(true)
    stopRef.current = false
    setBatch(list.map((modelId) => ({ modelId, result: null, running: false })))
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break
      setBatch((prev) =>
        prev.map((row, idx) =>
          idx === i ? { ...row, running: true } : row,
        ),
      )
      const result = await probeTextGeneration({ baseUrl, apiKey }, list[i])
      if (stopRef.current) {
        setBatch((prev) =>
          prev.map((row, idx) =>
            idx === i ? { ...row, running: false, result } : row,
          ),
        )
        break
      }
      setBatch((prev) =>
        prev.map((row, idx) =>
          idx === i ? { ...row, running: false, result } : row,
        ),
      )
      if (i < list.length - 1) await sleep(BATCH_INTERVAL_MS)
    }
    setBatchRunning(false)
  }

  const handleStop = () => {
    stopRef.current = true
  }

  const overLimit = selectedList.length > BATCH_MAX
  const passCount = batch.filter((r) => r.result?.status === "pass").length
  const failCount = batch.filter((r) => r.result?.status === "fail").length

  return (
    <section className="flex h-[560px] w-[360px] flex-col gap-2.5 overflow-hidden p-3">
      <header className="flex items-center gap-2">
        <button className="ta-btn ta-btn-icon" onClick={onBack} title="返回">
          ←
        </button>
        <h2 className="flex flex-1 items-center gap-1 overflow-hidden text-sm font-semibold">
          <Activity size={14} />
          <span className="truncate">{title ?? "验证"}</span>
          {copiedMsg && (
            <span className="text-[10px] font-normal text-emerald-500">
              {copiedMsg}
            </span>
          )}
        </h2>
        <button
          className="ta-btn ta-btn-icon"
          onClick={() => void fetchModels()}
          disabled={loading || batchRunning}
          title="重新获取模型"
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
      </header>

      {modelsError && (
        <p className="text-[11px] text-red-500 dark:text-red-400">{modelsError}</p>
      )}

      {loading ? (
        <p className="py-4 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
          获取模型中...
        </p>
      ) : models.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-500 dark:text-dark-text-tertiary">
          没有可用模型。
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <input
              className="ta-input flex-1"
              placeholder={`筛选 ${models.length} 个模型`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              className="ta-btn"
              onClick={toggleVisible}
              disabled={batchRunning}
              title="全选/取消可见"
            >
              {filtered.every((id) => selected.has(id)) && filtered.length > 0
                ? "取消可见"
                : "选可见"}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <ul className="flex flex-col gap-1">
              {filtered.map((id) => {
                const checked = selected.has(id)
                const row = batch.find((r) => r.modelId === id)
                return (
                  <li
                    key={id}
                    className="ta-card flex items-center gap-2 py-1.5"
                  >
                    <button
                      className="flex flex-1 items-center gap-1.5 text-left"
                      onClick={() => toggle(id)}
                      disabled={batchRunning}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] text-white ${
                          checked
                            ? "border-blue-500 bg-blue-500"
                            : "border-gray-400 dark:border-dark-text-tertiary"
                        }`}
                      >
                        {checked && "✓"}
                      </span>
                      <span className="truncate font-mono text-[11px]">{id}</span>
                    </button>
                    {row?.result && (
                      <span
                        className={`text-[10px] font-semibold ${
                          row.result.status === "pass"
                            ? "text-emerald-500 dark:text-emerald-400"
                            : "text-red-500 dark:text-red-400"
                        }`}
                      >
                        {row.result.status === "pass" ? "通过" : "失败"}
                      </span>
                    )}
                    {row?.running && (
                      <RefreshCw size={11} className="spin text-blue-500" />
                    )}
                    <button
                      className="ta-btn ta-btn-icon"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(id)
                          .then(() => flashCopied("已复制"))
                      }
                      title="复制"
                    >
                      ⧉
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            {overLimit && (
              <p className="text-[11px] text-red-500 dark:text-red-400">
                选中 {selectedList.length} 个，超过单批上限 {BATCH_MAX}。减少选择。
              </p>
            )}
            {batch.length > 0 && (
              <p className="text-[10px] text-gray-500 dark:text-dark-text-tertiary">
                通过 {passCount} · 失败 {failCount} · 共 {batch.length}
              </p>
            )}
            <div className="flex gap-1.5">
              {batchRunning ? (
                <button
                  className="ta-btn ta-btn-danger flex-1"
                  onClick={handleStop}
                >
                  停止
                </button>
              ) : (
                <button
                  className="ta-btn ta-btn-primary flex-1"
                  onClick={() => void handleBatch()}
                  disabled={selectedList.length === 0 || overLimit}
                >
                  测试选中（{selectedList.length}）串行
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
