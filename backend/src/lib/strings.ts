import { randomBytes } from "node:crypto";

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "workspace";
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
