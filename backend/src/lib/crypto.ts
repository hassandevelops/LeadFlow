import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";

const key = createHash("sha256")
  .update(env.ENCRYPTION_KEY ?? `${env.SESSION_SECRET}:integrations`)
  .digest();

const PREFIX = "v1";

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptJson<T>(payload: unknown): T | null {
  if (typeof payload !== "string") {
    return null;
  }
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(":");
    if (version !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
      return null;
    }
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
