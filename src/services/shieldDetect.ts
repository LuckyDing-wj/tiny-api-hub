// Cloudflare 挑战页检测。对照旧仓 all-api-hub content/cloudflareGuard 的启发式重写。
// detectShieldPage 会被 chrome.scripting.executeScript 注入临时页执行（见 tempPage.ts），
// 注入靠 toString() 序列化 —— 因此必须自包含：不能引用本模块其他符号，依赖只能来自
// window/document 实参。

export interface ShieldDetection {
  /** 是否判定为挑战/拦截页。 */
  isChallenge: boolean
  /** 累计得分，仅诊断用。 */
  score: number
  /** 命中的标记，仅诊断用。 */
  reasons: string[]
  title: string
  url: string | null
}

type Doc = Pick<Document, "title" | "querySelector">

/** 自包含检测函数：本地调用与 executeScript 注入共用。 */
export function detectShieldPage(doc: Doc = document): ShieldDetection {
  try {
    const reasons: string[] = []
    let score = 0

    const title = String(doc.title ?? "")
    const titleLower = title.toLowerCase()

    const url = (() => {
      try {
        return window.location.href
      } catch {
        return null
      }
    })()
    const parsedUrl = (() => {
      try {
        return url ? new URL(url) : null
      } catch {
        return null
      }
    })()

    // 强标记：单个命中即可判定
    const hasCfChlOpt = Boolean((window as any)._cf_chl_opt)
    if (hasCfChlOpt) {
      score += 3
      reasons.push("_cf_chl_opt")
    }

    const hasChallengePlatform = Boolean(
      doc.querySelector('script[src*="/cdn-cgi/challenge-platform/"]'),
    )
    if (hasChallengePlatform) {
      score += 3
      reasons.push("challenge-platform")
    }

    const hasChallengeForm = Boolean(
      doc.querySelector(
        'form.challenge-form, form#challenge-form, form[action*="__cf_chl_f_tk"]',
      ),
    )
    if (hasChallengeForm) {
      score += 3
      reasons.push("challenge-form")
    }

    // 弱标记：凑分用
    const urlIsChallenge = Boolean(
      parsedUrl?.pathname.startsWith("/cdn-cgi/") ||
        [...(parsedUrl?.searchParams.keys() ?? [])].some((k) =>
          k.startsWith("__cf_chl"),
        ),
    )
    if (urlIsChallenge) {
      score += 2
      reasons.push("cf-url")
    }

    const cfErrorCode = doc.querySelector(".cf-error-code")?.textContent ?? ""
    const isErrorCode1020 = cfErrorCode.includes("1020")
    if (isErrorCode1020) {
      score += 2
      reasons.push("cf-error-1020")
    }

    const titleLooksLikeInterstitial =
      titleLower.includes("just a moment") ||
      titleLower.includes("checking your browser") ||
      titleLower.includes("attention required") ||
      title.includes("请稍候")
    if (titleLooksLikeInterstitial) {
      score += 1
      reasons.push("title")
    }

    const hasTurnstile = Boolean(
      doc.querySelector(
        'script[src*="challenges.cloudflare.com/turnstile"], iframe[src*="challenges.cloudflare.com"]',
      ),
    )
    if (hasTurnstile) {
      score += 1
      reasons.push("turnstile")
    }

    const isChallenge =
      hasCfChlOpt ||
      hasChallengePlatform ||
      hasChallengeForm ||
      (score >= 3 &&
        (urlIsChallenge ||
          isErrorCode1020 ||
          titleLooksLikeInterstitial ||
          hasTurnstile))

    return { isChallenge, score, reasons, title, url }
  } catch {
    return { isChallenge: false, score: 0, reasons: [], title: "", url: null }
  }
}
