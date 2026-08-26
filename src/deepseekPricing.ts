/**
 * DeepSeek official pricing and session-cost estimates (USD).
 *
 * Source: DeepSeek "Model details" pricing table (USD / million tokens).
 * The API returns token usage, not money; this module applies the published
 * rates. The result is an estimate, not a bill — rates can change, and
 * DeepSeek's platform invoice is authoritative.
 *
 * Rules from that page:
 *  - cost = tokens × list price
 *  - cache-hit input uses the hit rate; remaining input (including cache
 *    writes) uses the miss rate
 *  - peak hours are Beijing time Mon–Fri 09:00–12:00 and 14:00–18:00;
 *    everything else is off-peak (half the peak rate)
 */

/** `[off-peak, peak]` USD per million tokens. */
export type UsdPerMillion = readonly [number, number]

/** One official model's published USD rates. */
export interface DeepSeekModelPrice {
  /** Input (cache miss, including tokens written to cache). */
  inputMiss: UsdPerMillion
  /** Input (cache hit). */
  inputHit: UsdPerMillion
  /** Output. */
  output: UsdPerMillion
}

/**
 * In-stock list prices, matched by API model-id prefix (longest prefix
 * wins). Unknown models return undefined so the UI shows tokens only.
 */
export const DEEPSEEK_MODEL_PRICES: Readonly<Record<string, DeepSeekModelPrice>> = {
  'deepseek-v4-flash': {
    inputMiss: [0.22, 0.44],
    inputHit: [0.007, 0.014],
    output: [0.66, 1.32],
  },
  'deepseek-v4-pro': {
    inputMiss: [0.66, 1.32],
    inputHit: [0.022, 0.044],
    output: [1.98, 3.96],
  },
  'deepseek-v4-flash-vision-exp': {
    inputMiss: [0.22, 0.44],
    inputHit: [0.007, 0.014],
    output: [0.66, 1.32],
  },
}

/**
 * DeepSeek 官方 API key 路由（余额/花费估算只对它们有意义）。参考社区
 * dsh-balance 的 provider 判定：DSH 自带官方路由 `deepseek-official`
 * （modelRoute.ts 默认路由），另兼容裸 `deepseek` 与 dsh-vision-router
 * 的 `deepseek-vision` 包装路由。
 */
export const DEEPSEEK_OFFICIAL_PROVIDERS: readonly string[] = [
  'deepseek',
  'deepseek-official',
  'deepseek-vision',
]

/** 是否 DeepSeek 官方 provider（余额与定价只适用于官方计费口径）。 */
export function isDeepSeekOfficialProvider(provider: string): boolean {
  return DEEPSEEK_OFFICIAL_PROVIDERS.includes(provider)
}

/**
 * 是否处于高峰计费时段：北京时间周一至周五 9:00-12:00、14:00-18:00。
 * 北京时间为 UTC+8 固定偏移（无夏令时），用 UTC 时刻加偏移换算。
 */
export function isPeakHour(date: Date = new Date()): boolean {
  const shifted = new Date(date.getTime() + 8 * 3_600_000)
  const weekday = shifted.getUTCDay() // 0 = Sunday
  const hour = shifted.getUTCHours()
  if (weekday === 0 || weekday === 6) return false
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

/** 按前缀匹配模型价目，最长前缀优先；未收录返回 undefined。 */
export function priceForModel(model: string): DeepSeekModelPrice | undefined {
  let best: DeepSeekModelPrice | undefined
  let bestLength = 0
  for (const [prefix, price] of Object.entries(DEEPSEEK_MODEL_PRICES)) {
    if (model.startsWith(prefix) && prefix.length > bestLength) {
      best = price
      bestLength = prefix.length
    }
  }
  return best
}

/** 会话累计 token（与 Channel.tokens 同构，含缓存分项）。 */
export interface CostTokenTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * 按计价时段分桶的会话 token：每笔 usage 按其发生时刻（event.time）落入
 * 高峰或空闲桶，估算时各按对应单价——跨时段会话不会整段按当前时段计价。
 */
export interface CostTokenBuckets {
  peak: CostTokenTotals
  idle: CostTokenTotals
}

/** 空桶（防御 tokens.peak/idle 缺失的旧数据/测试桩）。 */
const EMPTY_TOTALS: Readonly<CostTokenTotals> = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
})

/** Peak/off-peak costs in USD (not yet divided by 1e6). */
function costSplit(
  tokens: CostTokenBuckets,
  price: DeepSeekModelPrice,
): { peak: number; idle: number } {
  // 分桶字段在真实 Channel 上恒有（emptyTokenUsage 初始化），但旧快照与
  // 测试桩可能缺桶——缺失时按空桶计，绝不抛错。
  const peak = tokens.peak ?? EMPTY_TOTALS
  const idle = tokens.idle ?? EMPTY_TOTALS
  const costOf = (bucket: CostTokenTotals, rateIndex: 0 | 1): number => {
    const input = Math.max(0, bucket.input)
    const output = Math.max(0, bucket.output)
    const cacheRead = Math.max(0, Math.min(input, bucket.cacheRead))
    return (input - cacheRead) * price.inputMiss[rateIndex]
      + cacheRead * price.inputHit[rateIndex]
      + output * price.output[rateIndex]
  }
  return {
    peak: costOf(peak, 1),
    idle: costOf(idle, 0),
  }
}

/**
 * Session cost split in USD: peak bucket at peak rates, off-peak at
 * off-peak rates. Per bucket: (input − cacheRead) × miss + cacheRead × hit
 * + output × output. cacheWrite is not billed separately (those tokens
 * already sit in the miss portion of input). Unknown model or zero tokens
 * → undefined. Estimate, not a bill.
 */
export function estimateSessionCostSplitUsd(
  tokens: CostTokenBuckets,
  model: string,
): { total: number; peak: number; idle: number } | undefined {
  const price = priceForModel(model)
  if (price === undefined) return undefined
  const split = costSplit(tokens, price)
  const peak = tokens.peak ?? EMPTY_TOTALS
  const idle = tokens.idle ?? EMPTY_TOTALS
  const totalTokens =
    peak.input + peak.output + idle.input + idle.output
  if (totalTokens <= 0) return undefined
  return {
    total: split.peak / 1_000_000 + split.idle / 1_000_000,
    peak: split.peak / 1_000_000,
    idle: split.idle / 1_000_000,
  }
}

export function estimateSessionCostUsd(
  tokens: CostTokenBuckets,
  model: string,
): number | undefined {
  return estimateSessionCostSplitUsd(tokens, model)?.total
}

/**
 * Display FX for CNY-only wallets from the balance API. Session cost uses
 * the USD list prices above and does not go through this peg.
 */
export const CNY_PER_USD = 7.2

export function cnyToUsd(cny: number): number {
  return cny / CNY_PER_USD
}

export function formatUsd(usd: number, digits = 2): string {
  return `$${usd.toFixed(digits)}`
}
