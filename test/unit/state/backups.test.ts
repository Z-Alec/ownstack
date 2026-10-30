import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backupFile, restoreFile } from "../../../src/state/backups.js";
import { useTempDir } from "./helpers.js";

const tempDir = useTempDir();

describe("backups", () => {
  it("backs up and restores an existing file", async () => {
    const cwd = await tempDir();
    const file = join(cwd, "opencode.json");
    await writeFile(file, '{"original":true}\n');

    const backup = await backupFile(cwd, "opencode.json");
    expect(backup).toBeDefined();
    expect(await readFile(backup!, "utf8")).toBe('{"original":true}\n');

    await writeFile(file, '{"modified":1}\n');
    // A second backup must not replace the user's original.
    await backupFile(cwd, file);
    await writeFile(file, '{"modified":2}\n');

    expect(await restoreFile(cwd, file)).toBe(true);
    expect(await readFile(file, "utf8")).toBe('{"original":true}\n');
    expect(existsSync(backup!)).toBe(false);
    expect(await restoreFile(cwd, file)).toBe(false);
  });

  it("restoring a file that did not exist before removes it", async () => {
    const cwd = await tempDir();
    const file = join(cwd, "opencode.json");
    expect(await backupFile(cwd, file)).toBeUndefined();
    await writeFile(file, "{}");
    expect(await restoreFile(cwd, file)).toBe(true);
    expect(existsSync(file)).toBe(false);
  });
});
