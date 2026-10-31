import { randomBytes } from "node:crypto";

/** A CSPRNG-backed key: `sk-ownstack-` + base64url of 32 random bytes. */
export function generateKey(prefix = "sk-ownstack-"): string {
  return prefix + randomBytes(32).toString("base64url");
}
