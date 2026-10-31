import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import type { Logger } from "../core/types.js";
import { statePaths, STATE_DIR_NAME } from "../state/paths.js";
import { SECRETS_FILE_MODE } from "../state/secrets.js";
import { emptyState, saveState } from "../state/state.js";
import { createLogger } from "../util/logger.js";

export const CONFIG_FILE = "ownstack.config.ts";
const TEMPLATE_FILE = "ownstack.config.ts.tmpl";
const GITIGNORE_ENTRY = `${STATE_DIR_NAME}/`;
const FALLBACK_NAME = "my-stack";

export interface InitOptions {
  force?: boolean;
  log?: Logger;
}

export interface InitResult {
  configPath: string;
  stackName: string;
  gitignoreUpdated: boolean;
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Write a starter ownstack.config.ts, create .ownstack/ and add it to .gitignore")
    .option("--force", "overwrite an existing ownstack.config.ts")
    .action(async (opts: { force?: boolean }) => {
      await initStack(process.cwd(), { force: opts.force === true });
    });
}

export async function initStack(cwd: string, opts: InitOptions = {}): Promise<InitResult> {
  const log = opts.log ?? createLogger();
  const configPath = join(resolve(cwd), CONFIG_FILE);
  if (existsSync(configPath) && !opts.force) {
    throw new Error(`${CONFIG_FILE} already exists in ${cwd}. Re-run with --force to overwrite it.`);
  }

  const stackName = stackNameFromDir(cwd);
  const template = await readFile(templatePath(), "utf8");
  await writeFile(configPath, template.replaceAll("{{name}}", stackName));
  log.success(`Wrote ${CONFIG_FILE} (stack "${stackName}")`);

  await createStateDir(cwd, stackName, log);
  const gitignoreUpdated = await ensureGitignored(cwd);
  if (gitignoreUpdated) log.success(`Added ${GITIGNORE_ENTRY} to .gitignore`);

  log.info(
    [
      "Next steps:",
      `  1. Edit ${CONFIG_FILE}: set modelId to a Bedrock model enabled in your AWS account and region.`,
      "  2. Run `ownstack validate` to check the config.",
      "  3. Run `ownstack up` to provision the stack (available from M1).",
    ].join("\n"),
  );
  return { configPath, stackName, gitignoreUpdated };
}

/** Directory name sanitized to [a-z0-9-]{3,32}, else "my-stack". */
export function stackNameFromDir(dir: string): string {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  return name.length >= 3 ? name : FALLBACK_NAME;
}

async function createStateDir(cwd: string, stackName: string, log: Logger): Promise<void> {
  const paths = statePaths(cwd);
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await mkdir(paths.gatewayDir, { recursive: true });
  await mkdir(paths.backupsDir, { recursive: true });

  if (existsSync(paths.stateFile)) {
    log.warn(`Kept existing ${STATE_DIR_NAME}/state.json; it may still track resources.`);
  } else {
    await saveState(cwd, emptyState(stackName));
  }

  if (!existsSync(paths.secretsFile)) {
    await writeFile(paths.secretsFile, "", { mode: SECRETS_FILE_MODE });
  }
  await chmod(paths.secretsFile, SECRETS_FILE_MODE);
}

/** Add `.ownstack/` to .gitignore unless an equivalent entry exists. Returns true if the file changed. */
export async function ensureGitignored(cwd: string): Promise<boolean> {
  const file = join(resolve(cwd), ".gitignore");
  const current = existsSync(file) ? await readFile(file, "utf8") : "";
  const equivalents = new Set([STATE_DIR_NAME, `/${STATE_DIR_NAME}`, GITIGNORE_ENTRY, `/${GITIGNORE_ENTRY}`]);
  if (current.split(/\r?\n/).some((line) => equivalents.has(line.trim()))) return false;
  const sep = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  await writeFile(file, `${current}${sep}${GITIGNORE_ENTRY}\n`);
  return true;
}

/** templates/ lives at the package root: two levels up from src/cli/, one from dist/. */
function templatePath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "templates", TEMPLATE_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Cannot find templates/${TEMPLATE_FILE}; the ownstack installation looks incomplete.`);
}
