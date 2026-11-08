import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Yahoo tokens are encrypted before they're saved, so a leaked database alone
// doesn't expose them. Each one is tied to its site account: a token copied to
// another account's row won't decrypt.

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Reads the base64 key from YAHOO_TOKEN_ENCRYPTION_KEY. */
export function parseEncryptionKey(base64: string | undefined): Buffer {
  const key = Buffer.from(base64 ?? "", "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("YAHOO_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  }
  return key;
}

export function encryptToken(token: string, key: Buffer, userId: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), encrypted]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** Throws if the key or account is wrong, or the stored value was changed. */
export function decryptToken(stored: string, key: Buffer, userId: string): string {
  const [version, iv, tag, encrypted] = stored.split(".");
  if (version !== VERSION || !iv || !tag || encrypted === undefined) {
    throw new Error("Unrecognized encrypted token.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
