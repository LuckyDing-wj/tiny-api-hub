// API 验证。轻量版：原生 fetch 探测 /v1/models + 文本生成。

export const PROBE_IDS = {
  Models: "models",
  TextGeneration: "text-generation",
} as const

export type ProbeId = (typeof PROBE_IDS)[keyof typeof PROBE_IDS]

export const PROBE_STATUSES = {
  Pass: "pass",
  Fail: "fail",
  Skip: "skip",
} as const

export type ProbeStatus = (typeof PROBE_STATUSES)[keyof typeof PROBE_STATUSES]

export interface ProbeResult {
  id: ProbeId
  status: ProbeStatus
  latencyMs: number
  summary: string
  modelId?: string
}

export interface VerifyInput {
  baseUrl: string
  apiKey: string
  modelId?: string
}

function joinUrl(baseUrl: string, path: string): string {
  const origin = baseUrl.replace(/\/+$/, "")
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${origin}${suffix}`
}

function nowMs(): number {
  return Date.now()
}

function latency(started: number): number {
  return Math.max(0, Date.now() - started)
}

const PROBE_TIMEOUT_MS = 30_000

/** 合并外部 signal 和内部超时，返回 signal 和清理函数。 */
function withTimeout(external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener("abort", () => controller.abort(), { once: true })
  }
  timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer)
    },
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError"
}

function pickSuggestedModelId(modelIds: string[]): string | undefined {
  const normalized = modelIds
    .filter((id) => typeof id === "string" && id.trim())
    .map((id) => id.trim())
  if (normalized.length === 0) return undefined
  const preferred = normalized.find((id) => {
    const lower = id.toLowerCase()
    return (
      lower.startsWith("gpt") ||
      /^o\d/i.test(id) ||
      lower.startsWith("claude") ||
      lower.startsWith("gemini")
    )
  })
  return preferred ?? normalized[0]
}

/** GET /v1/models — OpenAI Compatible。 */
export async function probeModels(
  input: VerifyInput,
  signal?: AbortSignal,
): Promise<ProbeResult & { modelIds?: string[] }> {
  const started = nowMs()
  try {
    const res = await fetch(joinUrl(input.baseUrl, "/v1/models"), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      cache: "no-store",
      signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        id: PROBE_IDS.Models,
        status: PROBE_STATUSES.Fail,
        latencyMs: latency(started),
        summary: `HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
      }
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> }
    const modelIds = Array.isArray(body.data)
      ? body.data
          .map((m) => m.id)
          .filter((id): id is string => typeof id === "string")
      : []
    const suggested = pickSuggestedModelId(modelIds)
    return {
      id: PROBE_IDS.Models,
      status: PROBE_STATUSES.Pass,
      latencyMs: latency(started),
      summary: `找到 ${modelIds.length} 个模型${suggested ? `，建议 ${suggested}` : ""}`,
      modelId: suggested,
      modelIds,
    }
  } catch (err) {
    return {
      id: PROBE_IDS.Models,
      status: PROBE_STATUSES.Fail,
      latencyMs: latency(started),
      summary: err instanceof Error ? err.message : String(err),
    }
  }
}

/** POST /v1/chat/completions — 文本生成探测。有非空 choices 就算通过。 */
export async function probeTextGeneration(
  input: VerifyInput,
  modelId: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const started = nowMs()
  const { signal: timedSignal, cleanup } = withTimeout(signal)
  try {
    const res = await fetch(joinUrl(input.baseUrl, "/v1/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 64,
        stream: false,
      }),
      signal: timedSignal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        id: PROBE_IDS.TextGeneration,
        status: PROBE_STATUSES.Fail,
        latencyMs: latency(started),
        summary: `HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
        modelId,
      }
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    const content = body.choices?.[0]?.message?.content ?? ""
    const contentText = typeof content === "string" ? content.trim() : ""
    if (body.error?.message) {
      return {
        id: PROBE_IDS.TextGeneration,
        status: PROBE_STATUSES.Fail,
        latencyMs: latency(started),
        summary: body.error.message.slice(0, 200),
        modelId,
      }
    }
    if (contentText) {
      return {
        id: PROBE_IDS.TextGeneration,
        status: PROBE_STATUSES.Pass,
        latencyMs: latency(started),
        summary: `响应：${contentText.slice(0, 100)}`,
        modelId,
      }
    }
    return {
      id: PROBE_IDS.TextGeneration,
      status: PROBE_STATUSES.Fail,
      latencyMs: latency(started),
      summary: "响应为空",
      modelId,
    }
  } catch (err) {
    const timedOut = isAbortError(err) && !signal?.aborted
    return {
      id: PROBE_IDS.TextGeneration,
      status: PROBE_STATUSES.Fail,
      latencyMs: latency(started),
      summary: timedOut
        ? `超时（> ${PROBE_TIMEOUT_MS / 1000}s）`
        : err instanceof Error
          ? err.message
          : String(err),
      modelId,
    }
  } finally {
    cleanup()
  }
}
