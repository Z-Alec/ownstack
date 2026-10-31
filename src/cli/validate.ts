import { basename, dirname, resolve } from "node:path";
import type { Command } from "commander";
import { ConfigError, DEFAULT_CONFIG_FILE, loadConfig } from "../config/loader.js";

export function registerValidate(program: Command): void {
  program
    .command("validate")
    .description("Load and validate the stack config (no network calls)")
    .option("-c, --config <path>", "path to the config file", DEFAULT_CONFIG_FILE)
    .action(async (opts: { config: string }) => {
      const path = resolve(process.cwd(), opts.config);
      try {
        const config = await loadConfig(dirname(path), basename(path));
        const models = Object.entries(config.models)
          .map(([alias, backend]) => `${alias} (${backend.kind})`)
          .join(", ");
        console.log(`✔ ${opts.config} is valid: stack "${config.name}", models: ${models}`);
      } catch (err) {
        if (!(err instanceof ConfigError)) throw err;
        console.error(err.message);
        process.exitCode = 1;
      }
    });
}
