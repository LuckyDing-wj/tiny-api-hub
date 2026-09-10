const PREFERENCES_KEY = "tiny_api_hub_preferences_v1"

export type ThemePreference = "dark" | "light" | "system"
export type CurrencyPreference = "USD" | "CNY"

export interface Preferences {
  theme: ThemePreference
  currency: CurrencyPreference
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark",
  currency: "USD",
}

function isTheme(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system"
}

function isCurrency(value: unknown): value is CurrencyPreference {
  return value === "USD" || value === "CNY"
}

export function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_PREFERENCES }
  }
  const raw = value as Record<string, unknown>
  return {
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_PREFERENCES.theme,
    currency: isCurrency(raw.currency) ? raw.currency : DEFAULT_PREFERENCES.currency,
  }
}

export async function loadPreferences(): Promise<Preferences> {
  const res = await chrome.storage.local.get(PREFERENCES_KEY)
  return normalizePreferences(res[PREFERENCES_KEY])
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await chrome.storage.local.set({
    [PREFERENCES_KEY]: normalizePreferences(prefs),
  })
}
