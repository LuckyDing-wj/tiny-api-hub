import {
  decryptBackupEnvelope,
  encryptBackupContent,
  tryParseEncryptedEnvelope,
} from "~/services/webdavCrypto"

const WEBDAV_KEY = "tiny_api_hub_webdav_v1"
const BACKUP_FOLDER = "tiny-api-hub-backup"
const BACKUP_FILE = "tiny-api-hub-1-0.json"

export class WebdavError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = "WebdavError"
    this.status = status
  }
}

export interface WebdavConfig {
  url: string
  username: string
  password: string
  encrypt: boolean
  passphrase: string
}

export const DEFAULT_WEBDAV_CONFIG: WebdavConfig = {
  url: "",
  username: "",
  password: "",
  encrypt: true,
  passphrase: "",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function normalizeWebdavConfig(value: unknown): WebdavConfig {
  if (!isRecord(value)) return { ...DEFAULT_WEBDAV_CONFIG }
  return {
    url: typeof value.url === "string" ? value.url.trim() : "",
    username: typeof value.username === "string" ? value.username : "",
    password: typeof value.password === "string" ? value.password : "",
    encrypt: value.encrypt !== false,
    passphrase: typeof value.passphrase === "string" ? value.passphrase : "",
  }
}

export async function loadWebdavConfig(): Promise<WebdavConfig> {
  const res = await chrome.storage.local.get(WEBDAV_KEY)
  return normalizeWebdavConfig(res[WEBDAV_KEY])
}

export async function saveWebdavConfig(config: WebdavConfig): Promise<void> {
  await chrome.storage.local.set({
    [WEBDAV_KEY]: normalizeWebdavConfig(config),
  })
}

function authHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function requireConfig(config: WebdavConfig): WebdavConfig {
  const cfg = normalizeWebdavConfig(config)
  if (!cfg.url || !cfg.username || !cfg.password) {
    throw new WebdavError("请填写 WebDAV 地址、用户名和密码")
  }
  if (cfg.encrypt && !cfg.passphrase) {
    throw new WebdavError("已开启加密，请填写加密口令")
  }
  return cfg
}

/** 目录 URL 补成固定备份文件路径；已是 .json 则原样用。 */
export function resolveBackupUrl(url: string): string {
  if (/\.json($|[?#])/i.test(url)) return url
  const sep = url.endsWith("/") ? "" : "/"
  return `${url}${sep}${BACKUP_FOLDER}/${BACKUP_FILE}`
}

function parentDir(targetUrl: string): string {
  const marker = `${BACKUP_FOLDER}/`
  const idx = targetUrl.indexOf(marker)
  if (idx >= 0) return targetUrl.slice(0, idx + marker.length - 1)
  const cut = targetUrl.lastIndexOf("/")
  return cut > 0 ? targetUrl.slice(0, cut) : targetUrl
}

async function mkcol(dirUrl: string, username: string, password: string): Promise<void> {
  const tryOnce = (url: string) =>
    fetch(url, {
      method: "MKCOL",
      headers: { Authorization: authHeader(username, password) },
    })
  const res = await tryOnce(dirUrl)
  if (res.status === 201 || res.status === 405 || (res.status >= 200 && res.status < 300)) {
    return
  }
  if (!dirUrl.endsWith("/")) {
    const res2 = await tryOnce(`${dirUrl}/`)
    if (res2.status === 201 || res2.status === 405 || (res2.status >= 200 && res2.status < 300)) {
      return
    }
  }
}

async function putText(
  url: string,
  username: string,
  password: string,
  content: string,
): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authHeader(username, password),
      "Content-Type": "application/json",
    },
    body: content,
  })
  if (res.status >= 200 && res.status < 300) return
  if (res.status === 401 || res.status === 403) {
    throw new WebdavError("WebDAV 认证失败", res.status)
  }
  throw new WebdavError(`上传失败 HTTP ${res.status}`, res.status)
}

async function getText(url: string, username: string, password: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader(username, password),
      Accept: "application/json, text/plain, */*",
    },
    cache: "no-store",
  })
  if (res.status >= 200 && res.status < 300) return res.text()
  if (res.status === 401 || res.status === 403) {
    throw new WebdavError("WebDAV 认证失败", res.status)
  }
  if (res.status === 404) {
    throw new WebdavError("远端还没有备份文件", 404)
  }
  throw new WebdavError(`下载失败 HTTP ${res.status}`, res.status)
}

export async function testWebdav(config: WebdavConfig): Promise<void> {
  const cfg = requireConfig({ ...config, encrypt: false, passphrase: config.passphrase })
  const res = await fetch(cfg.url, {
    method: "GET",
    headers: { Authorization: authHeader(cfg.username, cfg.password) },
    cache: "no-store",
  })
  if (res.status === 401 || res.status === 403) {
    throw new WebdavError("WebDAV 认证失败", res.status)
  }
  // 目录 GET 经常 404/405；2xx/3xx 也算通
  if (
    res.status === 404 ||
    res.status === 405 ||
    (res.status >= 200 && res.status < 400)
  ) {
    return
  }
  throw new WebdavError(`连接失败 HTTP ${res.status}`, res.status)
}

export async function uploadWebdavBackup(
  config: WebdavConfig,
  plaintext: string,
): Promise<string> {
  const cfg = requireConfig(config)
  const targetUrl = resolveBackupUrl(cfg.url)
  await mkcol(parentDir(targetUrl), cfg.username, cfg.password)
  const body = cfg.encrypt
    ? JSON.stringify(await encryptBackupContent(plaintext, cfg.passphrase))
    : plaintext
  await putText(targetUrl, cfg.username, cfg.password, body)
  return targetUrl
}

export async function downloadWebdavBackup(config: WebdavConfig): Promise<string> {
  const cfg = requireConfig(config)
  const targetUrl = resolveBackupUrl(cfg.url)
  const content = await getText(targetUrl, cfg.username, cfg.password)
  const envelope = tryParseEncryptedEnvelope(content)
  if (!envelope) return content
  if (!cfg.passphrase) {
    throw new WebdavError("远端是加密备份，请填写加密口令")
  }
  return decryptBackupEnvelope(envelope, cfg.passphrase)
}
