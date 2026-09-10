// 站点价格模型类型。精简自旧仓 src/services/modelList/pricingModel.ts。
// 复用类型定义，去掉无关的 source/metadata 复杂度（精简范围不需要）。

export type PerCallPrice = number | { input: number; output: number }

/** 计费类型：0 = token 计费，1 = 按次计费。 */
export type QuotaType = number

export interface ModelPricing {
  model_name: string
  quota_type: QuotaType
  model_ratio: number
  model_price: number | PerCallPrice
  completion_ratio: number
  enable_groups: string[]
  supported_endpoint_types?: string[]
  /** 直接 USD 价（per 1M tokens），用于不使用倍率语义的站点。 */
  token_price_usd_per_million?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
  }
  /** 缓存价相对输入价的倍率。 */
  token_price_ratios_to_input?: {
    cache_read?: number
    cache_write?: number
  }
  /** 原始行可能带的厂商 id（New API family）。 */
  vendor_id?: number
}

export interface PricingResponse {
  data: ModelPricing[]
  group_ratio: Record<string, number>
  success?: boolean
  usable_group?: Record<string, unknown>
  vendors?: Array<{ id: number; name: string }>
}

/** 0 = token 计费，其他 = 按次。 */
export function isTokenBillingType(quotaType: number): boolean {
  return quotaType === 0
}
