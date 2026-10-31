import { createConsola, type ConsolaInstance } from "consola";
import type { Logger } from "../core/types.js";
import { redact } from "./redact.js";

export interface LoggerOptions {
  /** Defaults to info (3); 4 enables debug. */
  level?: number;
  /** Override the underlying consola instance (used by tests). */
  consola?: ConsolaInstance;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const c =
    opts.consola ??
    createConsola({ level: opts.level ?? (process.env.OWNSTACK_DEBUG ? 4 : 3) });
  return {
    info: (msg) => c.info(redact(msg)),
    warn: (msg) => c.warn(redact(msg)),
    error: (msg) => c.error(redact(msg)),
    success: (msg) => c.success(redact(msg)),
    debug: (msg) => c.debug(redact(msg)),
  };
}
