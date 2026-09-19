// 模型价格计算。复用旧仓 src/services/models/utils/modelPricing.ts 算法。
// 去掉 i18n、UI 样式 helper（精简范围不需要）。

import {
  isTokenBillingType,
  type ModelPricing,
  type PerCallPrice,
} from "~/services/pricingModel"
import { QUOTA_PER_USD } from "~/services/newApi"

const TOKEN_PRICE_UNIT_TOKENS = 1_000_000
const NEW_API_RATIO_BASE_USD_PER_MILLION_TOKENS =
  TOKEN_PRICE_UNIT_TOKENS / QUOTA_PER_USD // = 2

export interface TokenPricesUSD {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export interface CalculatedTokenPrice {
  kind: "token"
  usdPerMillionTokens: TokenPricesUSD
}

export interface CalculatedPerCallPrice {
  kind: "per-call"
  usdPerCall: PerCallPrice
}

export interface UnavailableCalculatedPrice {
  kind: "unavailable"
  billingMode: "token" | "per-call"
}

export type CalculatedPrice =
  | CalculatedTokenPrice
  | CalculatedPerCallPrice
  | UnavailableCalculatedPrice

const isFiniteTokenPrice = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isFiniteNonnegativeCachePrice = (
  value: number | undefined,
): value is number => isFiniteTokenPrice(value) && value >= 0

const resolveOptionalCachePrice = (
  directPrice: number | undefined,
  ratio: number | undefined,
  inputPrice: number,
): number | undefined => {
  if (isFiniteNonnegativeCachePrice(directPrice)) return directPrice
  return isFiniteNonnegativeCachePrice(ratio)
    ? inputPrice * ratio
    : undefined
}

const resolveDirectTokenPriceUSD = (
  model: ModelPricing,
): Partial<TokenPricesUSD> => {
  const directInputUSD = model.token_price_usd_per_million?.input
  const directOutputUSD = model.token_price_usd_per_million?.output
  return {
    ...(isFiniteTokenPrice(directInputUSD) ? { input: directInputUSD } : {}),
    ...(isFiniteTokenPrice(directOutputUSD) ? { output: directOutputUSD } : {}),
  }
}

const calculateRatioTokenPriceUSD = (
  model: ModelPricing,
  groupMultiplier: number,
): TokenPricesUSD => {
  const input =
    model.model_ratio *
    NEW_API_RATIO_BASE_USD_PER_MILLION_TOKENS *
    groupMultiplier
  const output = input * model.completion_ratio
  return { input, output }
}

// Done Hub 专用折算已随站点类型一起砍掉：{input,output} 对象形态是 Done Hub 的
// payload，标准 New API 的 model_price 是数字（USD/次）。对象形态按不支持处理。
const calculateModelPerCallPrice = (
  cost: PerCallPrice,
  factor: number,
): number | undefined => {
  if (typeof cost === "number") return cost * factor
  return undefined
}

/** 计算模型价格。groupMultiplier 来自 group_ratio.default。 */
export function calculateModelPrice(
  model: ModelPricing,
  groupMultiplier: number,
): CalculatedPrice {
  const effectiveGroupMultiplier =
    Number.isFinite(groupMultiplier) && groupMultiplier >= 0
      ? groupMultiplier
      : 1

  if (isTokenBillingType(model.quota_type)) {
    const ratioPrice = calculateRatioTokenPriceUSD(
      model,
      effectiveGroupMultiplier,
    )
    const directPrice = resolveDirectTokenPriceUSD(model)
    const input = directPrice.input ?? ratioPrice.input
    const cacheRead = resolveOptionalCachePrice(
      model.token_price_usd_per_million?.cache_read,
      model.token_price_ratios_to_input?.cache_read,
      input,
    )
    const cacheWrite = resolveOptionalCachePrice(
      model.token_price_usd_per_million?.cache_write,
      model.token_price_ratios_to_input?.cache_write,
      input,
    )
    return {
      kind: "token",
      usdPerMillionTokens: {
        input,
        output: directPrice.output ?? ratioPrice.output,
        ...(cacheRead !== undefined ? { cacheRead } : {}),
        ...(cacheWrite !== undefined ? { cacheWrite } : {}),
      },
    }
  }

  const perCallUSD = calculateModelPerCallPrice(
    model.model_price,
    effectiveGroupMultiplier,
  )
  if (perCallUSD === undefined) {
    return { kind: "unavailable", billingMode: "per-call" }
  }
  return {
    kind: "per-call",
    usdPerCall: perCallUSD,
  }
}

export function formatPrice(price: number, precision = 4): string {
  if (price === 0) return "$0"
  if (price < 0.0001) return `$${price.toExponential(2)}`
  return `$${price.toFixed(precision)}`
}

export function formatPriceCompact(price: number): string {
  if (price === 0) return "$0"
  if (price < 0.01) return `$${price.toFixed(6)}`
  if (price < 1) return `$${price.toFixed(4)}`
  return `$${price.toFixed(2)}`
}

/** 把 CalculatedPrice 拍平成 input/output USD。 */
export function resolveDisplayPrice(
  calc: CalculatedPrice,
): {
  input?: number
  output?: number
  billingMode: "token" | "per-call"
} {
  if (calc.kind === "token") {
    return {
      input: calc.usdPerMillionTokens.input,
      output: calc.usdPerMillionTokens.output,
      billingMode: "token",
    }
  }
  if (calc.kind === "per-call") {
    const usd = calc.usdPerCall
    if (typeof usd === "number") {
      return { input: usd, billingMode: "per-call" }
    }
    return { input: usd.input, output: usd.output, billingMode: "per-call" }
  }
  return { billingMode: calc.billingMode }
}
