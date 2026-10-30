import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { execa, type Options } from "execa";
import { redact } from "./redact.js";

export interface RunOptions {
  cwd?: string;
  /** Extra env vars for the child; never included in errors or logs. */
  env?: Record<string, string | undefined>;
  input?: string;
  timeoutMs?: number;
  /** Don't throw on non-zero exit; inspect exitCode instead. */
  reject?: boolean;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ExecError extends Error {
  override name = "ExecError";
  constructor(
    message: string,
    readonly exitCode: number | undefined,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

export async function run(cmd: string, args: readonly string[] = [], opts: RunOptions = {}): Promise<RunResult> {
  const options: Options = {
    cwd: opts.cwd,
    env: opts.env,
    input: opts.input,
    timeout: opts.timeoutMs,
    reject: false,
    stripFinalNewline: true,
  };
  let result;
  try {
    result = await execa(cmd, [...args], options);
  } catch (err) {
    throw new ExecError(redact(`${cmd}: ${err instanceof Error ? err.message : String(err)}`), undefined, "", "");
  }
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  const exitCode = result.exitCode ?? -1;
  if (opts.reject !== false && (result.failed || exitCode !== 0)) {
    const why = result.timedOut ? "timed out" : `exited with code ${exitCode}`;
    const output = stderr || stdout || ("originalMessage" in result ? String(result.originalMessage ?? "") : "");
    const detail = output.trim().split("\n").slice(-20).join("\n");
    throw new ExecError(
      redact(`${[cmd, ...args].join(" ")} ${why}${detail ? `:\n${detail}` : ""}`),
      exitCode,
      redact(stdout),
      redact(stderr),
    );
  }
  return { stdout, stderr, exitCode };
}

/** Absolute path of `bin` on PATH, or undefined. */
export async function which(bin: string): Promise<string | undefined> {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, bin + ext);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return undefined;
}
