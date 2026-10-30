import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initStack, stackNameFromDir } from "../../src/cli/init.js";
import { loadConfig } from "../../src/config/loader.js";
import type { Logger } from "../../src/core/types.js";
import { loadState } from "../../src/state/state.js";
import { useTempDir } from "./state/helpers.js";

const tempDir = useTempDir();
const silent: Logger = { info() {}, warn() {}, error() {}, success() {}, debug() {} };

async function projectDir(name = "my-project"): Promise<string> {
  const dir = join(await tempDir(), name);
  await mkdir(dir);
  return dir;
}

describe("ownstack init", () => {
  it("creates the config, .ownstack/ and the gitignore entry in an empty dir", async () => {
    const cwd = await projectDir();
    const result = await initStack(cwd, { log: silent });

    expect(result.stackName).toBe("my-project");
    const config = await readFile(join(cwd, "ownstack.config.ts"), "utf8");
    expect(config).toContain('import { defineStack, opencode, litellm, bedrock } from "ownstack";');
    expect(config).toContain('name: "my-project"');
    expect(config).not.toContain("{{");

    expect(await loadState(cwd, "my-project")).toMatchObject({ stackName: "my-project", resources: [] });
    expect((await stat(join(cwd, ".ownstack/secrets.env"))).mode & 0o777).toBe(0o600);
    expect(existsSync(join(cwd, ".ownstack/gateway"))).toBe(true);
    expect(existsSync(join(cwd, ".ownstack/backups"))).toBe(true);
    expect(await readFile(join(cwd, ".gitignore"), "utf8")).toBe(".ownstack/\n");
  });

  it("writes a starter config that passes validation", async () => {
    const cwd = await projectDir();
    await initStack(cwd, { log: silent });
    const config = await loadConfig(cwd);
    expect(config.name).toBe("my-project");
  });

  it("refuses to overwrite without --force and never duplicates the gitignore line", async () => {
    const cwd = await projectDir();
    await writeFile(join(cwd, ".gitignore"), "node_modules\ndist");
    await initStack(cwd, { log: silent });
    await writeFile(join(cwd, "ownstack.config.ts"), "// mine\n");

    await expect(initStack(cwd, { log: silent })).rejects.toThrow(/already exists.*--force/);
    expect(await readFile(join(cwd, "ownstack.config.ts"), "utf8")).toBe("// mine\n");

    await initStack(cwd, { force: true, log: silent });
    expect(await readFile(join(cwd, "ownstack.config.ts"), "utf8")).toContain("defineStack");
    expect(await readFile(join(cwd, ".gitignore"), "utf8")).toBe("node_modules\ndist\n.ownstack/\n");
  });

  it("recognises an existing equivalent gitignore entry", async () => {
    const cwd = await projectDir();
    await writeFile(join(cwd, ".gitignore"), "/.ownstack\n");
    const result = await initStack(cwd, { log: silent });
    expect(result.gitignoreUpdated).toBe(false);
    expect(await readFile(join(cwd, ".gitignore"), "utf8")).toBe("/.ownstack\n");
  });

  it("derives a valid stack name from the directory", () => {
    expect(stackNameFromDir("/x/My Cool_Project!")).toBe("my-cool-project");
    expect(stackNameFromDir("/x/ab")).toBe("my-stack");
    expect(stackNameFromDir("/x/---")).toBe("my-stack");
    expect(stackNameFromDir(`/x/${"a".repeat(40)}`)).toBe("a".repeat(32));
  });
});
