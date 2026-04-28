import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const VERSION = "v1";

export class AICredentialEncryptionError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AICredentialEncryptionError";
    this.code = code;
  }
}

function loadMasterKey(): Buffer {
  const raw = process.env.AI_CREDENTIAL_KEY?.trim();
  if (!raw) {
    throw new AICredentialEncryptionError(
      "AI_CREDENTIAL_KEY is not configured",
      "MISSING_MASTER_KEY"
    );
  }

  const buffer = decodeMasterKey(raw);
  if (buffer.length !== KEY_BYTES) {
    throw new AICredentialEncryptionError(
      `AI_CREDENTIAL_KEY must decode to ${KEY_BYTES} bytes (got ${buffer.length})`,
      "INVALID_MASTER_KEY"
    );
  }
  return buffer;
}

function decodeMasterKey(value: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  if (/^[A-Za-z0-9+/=_-]+$/.test(value)) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    try {
      const buf = Buffer.from(padded, "base64");
      if (buf.length === KEY_BYTES) return buf;
    } catch {
      // fall through
    }
  }
  return createHash("sha256").update(value, "utf8").digest();
}

export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new AICredentialEncryptionError("Cannot encrypt empty secret", "EMPTY_PLAINTEXT");
  }
  const key = loadMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  if (typeof stored !== "string" || !stored) {
    throw new AICredentialEncryptionError("Cannot decrypt empty value", "EMPTY_CIPHERTEXT");
  }
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new AICredentialEncryptionError("Unsupported AI credential ciphertext format", "INVALID_CIPHERTEXT_FORMAT");
  }
  const key = loadMasterKey();
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_BYTES) {
    throw new AICredentialEncryptionError("Invalid IV length", "INVALID_IV");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (err) {
    throw new AICredentialEncryptionError(
      `Failed to decrypt AI credential: ${err instanceof Error ? err.message : String(err)}`,
      "DECRYPTION_FAILED"
    );
  }
}

export function isAICredentialEncryptionConfigured(): boolean {
  try {
    loadMasterKey();
    return true;
  } catch {
    return false;
  }
}

export function generateMasterKeyHex(): string {
  return randomBytes(KEY_BYTES).toString("hex");
}
