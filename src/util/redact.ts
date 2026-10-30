export const REDACTED = "[REDACTED]";

/** Values shorter than this are not registered, to avoid redacting ordinary words. */
const MIN_SECRET_LENGTH = 8;

const registered = new Set<string>();

export interface KeyPattern {
  name: string;
  regex: RegExp;
  /** Optional extra check on a match, for shapes too broad to express as a regex alone. */
  accept?: (match: string) => boolean;
}

/** Mixed-case, digit-bearing 40-char strings; excludes lowercase hex such as git SHAs. */
export function looksLikeAwsSecret(s: string): boolean {
  return /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9/+]/.test(s);
}

/** Key-shaped strings redacted from all output and rejected by the secret-scan test. */
export const KEY_PATTERNS: readonly KeyPattern[] = [
  { name: "pem-private-key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { name: "bearer-token", regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g },
  { name: "sk-token", regex: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { name: "aws-access-key-id", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    name: "aws-secret-access-key",
    regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g,
    accept: looksLikeAwsSecret,
  },
];

export function registerSecret(value: string | undefined | null): void {
  if (value && value.length >= MIN_SECRET_LENGTH) registered.add(value);
}

/** Test-only: forget registered secrets. */
export function clearRegisteredSecrets(): void {
  registered.clear();
}

export function redact(text: string): string {
  let out = text;
  // Longest first, so a secret containing another is fully replaced.
  for (const secret of [...registered].sort((a, b) => b.length - a.length)) {
    out = out.split(secret).join(REDACTED);
  }
  for (const { name, regex, accept } of KEY_PATTERNS) {
    out = out.replace(regex, (m) => {
      if (accept && !accept(m)) return m;
      return name === "bearer-token" ? `Bearer ${REDACTED}` : REDACTED;
    });
  }
  return out;
}

/** Redact an unknown thrown value into a safe message. */
export function redactError(err: unknown): string {
  return redact(err instanceof Error ? err.message : String(err));
}
