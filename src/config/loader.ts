import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import type { z } from "zod";
import { stackSchema, type StackConfig } from "./schema.js";

export const DEFAULT_CONFIG_FILE = "ownstack.config.ts";

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly file: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadConfig(cwd: string, file = DEFAULT_CONFIG_FILE): Promise<StackConfig> {
  const path = resolve(cwd, file);
  if (!existsSync(path)) throw new ConfigError(`Config file not found: ${path}`, path);

  let mod: { default?: unknown };
  try {
    mod = await jiti().import<{ default?: unknown }>(path);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Failed to load ${path}:\n  ${reason}`, path);
  }
  if (mod.default === undefined) {
    throw new ConfigError(`${path} has no default export; use \`export default defineStack({ ... })\``, path);
  }
  return parseConfig(mod.default, path);
}

export function parseConfig(input: unknown, file = DEFAULT_CONFIG_FILE): StackConfig {
  const result = stackSchema.safeParse(input, { error: issueMessage });
  if (result.success) return result.data;
  const issues = formatIssues(result.error.issues);
  const header = `Invalid config ${file} (${issues.length} ${issues.length === 1 ? "issue" : "issues"}):`;
  throw new ConfigError([header, ...issues.map((i) => `  - ${i}`)].join("\n"), file, issues);
}

export function formatIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => `${formatPath([...issue.path, key])}: unknown key "${key}"`);
    }
    if (issue.code === "invalid_key") {
      return [`${formatPath(issue.path)}: ${issue.issues[0]?.message ?? issue.message}`];
    }
    return [`${formatPath(issue.path)}: ${issue.message}`];
  });
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(config)";
  return path
    .map((seg, i) => (typeof seg === "number" ? `[${seg}]` : `${i === 0 ? "" : "."}${String(seg)}`))
    .join("");
}

function issueMessage(issue: z.core.$ZodRawIssue): string | undefined {
  if (issue.code === "invalid_union" && issue.discriminator !== undefined && Array.isArray(issue.options)) {
    const options = issue.options.map((o: unknown) => JSON.stringify(o)).join(", ");
    const given = isRecord(issue.input) ? issue.input[issue.discriminator] : undefined;
    return given === undefined
      ? "is required; use bedrock(), skypilotGpu() or endpoint()"
      : `unknown ${issue.discriminator} ${JSON.stringify(given)}; must be one of ${options}`;
  }
  if (issue.code === "invalid_type" && issue.input === undefined) return "is required";
  if (issue.code === "invalid_type") return `must be ${issue.expected}`;
  if (issue.code === "invalid_value" && issue.values.length > 0) {
    return `must be one of ${issue.values.map((v) => JSON.stringify(v)).join(", ")}`;
  }
  return undefined;
}

function isRecord(v: unknown): v is Record<PropertyKey, unknown> {
  return typeof v === "object" && v !== null;
}

let jitiInstance: ReturnType<typeof createJiti> | undefined;

function jiti() {
  const self = selfEntry();
  jitiInstance ??= createJiti(import.meta.url, {
    interopDefault: false,
    moduleCache: false,
    fsCache: false,
    ...(self ? { alias: { ownstack: self } } : {}),
  });
  return jitiInstance;
}

/** Resolve `import "ownstack"` to this package when running from source or a local build. */
function selfEntry(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  return [join(here, "../index.ts"), join(here, "index.js"), join(here, "../index.js")].find((p) => existsSync(p));
}
