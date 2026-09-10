const ENVELOPE_TYPE = "tiny-api-hub-webdav-backup-encrypted"
const ENVELOPE_VERSION = 1
const KDF = "PBKDF2"
const CIPHER = "AES-GCM"
const DEFAULT_ITERATIONS = 250_000

export interface EncryptedBackupEnvelope {
  type: typeof ENVELOPE_TYPE
  v: typeof ENVELOPE_VERSION
  kdf: typeof KDF
  cipher: typeof CIPHER
  iter: number
  salt: string
  iv: string
  ct: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  crypto.getRandomValues(bytes)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const saltCopy = new Uint8Array(new ArrayBuffer(salt.byteLength))
  saltCopy.set(salt)
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: saltCopy, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export function tryParseEncryptedEnvelope(content: string): EncryptedBackupEnvelope | null {
  try {
    const obj = JSON.parse(content) as Partial<EncryptedBackupEnvelope>
    if (
      obj &&
      obj.type === ENVELOPE_TYPE &&
      obj.v === ENVELOPE_VERSION &&
      obj.kdf === KDF &&
      obj.cipher === CIPHER &&
      typeof obj.iter === "number" &&
      typeof obj.salt === "string" &&
      typeof obj.iv === "string" &&
      typeof obj.ct === "string"
    ) {
      return obj as EncryptedBackupEnvelope
    }
    return null
  } catch {
    return null
  }
}

export async function encryptBackupContent(
  content: string,
  password: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<EncryptedBackupEnvelope> {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(password, salt, iterations)
  const plaintext = new TextEncoder().encode(content)
  const plaintextCopy = new Uint8Array(new ArrayBuffer(plaintext.byteLength))
  plaintextCopy.set(plaintext)
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintextCopy)
  return {
    type: ENVELOPE_TYPE,
    v: ENVELOPE_VERSION,
    kdf: KDF,
    cipher: CIPHER,
    iter: iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(encrypted)),
  }
}

export async function decryptBackupEnvelope(
  envelope: EncryptedBackupEnvelope,
  password: string,
): Promise<string> {
  const salt = base64ToBytes(envelope.salt)
  const iv = base64ToBytes(envelope.iv)
  const ct = base64ToBytes(envelope.ct)
  const ivFixed = new Uint8Array(new ArrayBuffer(iv.byteLength))
  ivFixed.set(iv)
  const ctFixed = new Uint8Array(new ArrayBuffer(ct.byteLength))
  ctFixed.set(ct)
  try {
    const key = await deriveKey(password, salt, envelope.iter)
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivFixed },
      key,
      ctFixed,
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    throw new Error("解密失败，检查加密口令")
  }
}
