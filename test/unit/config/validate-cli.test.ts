import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerValidate } from "../../../src/cli/validate.js";

const root = join(import.meta.dirname, "../../..");
const example = join(root, "examples/bedrock-plus-gpu/ownstack.config.ts");
const badFixture = join(root, "test/fixtures/configs/missing-alias.config.ts");

async function runInProcess(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((m: string) => void out.push(m));
  vi.spyOn(console, "error").mockImplementation((m: string) => void err.push(m));
  const program = new Command().exitOverride();
  registerValidate(program);
  await program.parseAsync(["validate", ...args], { from: "user" });
  const exitCode = process.exitCode;
  process.exitCode = undefined;
  return { exitCode, stdout: out.join("\n"), stderr: err.join("\n") };
}

afterEach(() => vi.restoreAllMocks());

describe("ownstack validate (in process)", () => {
  it("prints the stack name and aliases for a valid config", async () => {
    const res = await runInProcess(["--config", example]);
    expect(res.exitCode).toBeUndefined();
    expect(res.stdout).toContain('stack "bedrock-plus-gpu", models: primary (bedrock), bulk (skypilotGpu)');
  });

  it("prints every issue and sets a non-zero exit code for an invalid config", async () => {
    const res = await runInProcess(["--config", badFixture]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('harness.model: alias "primay" is not defined in models (defined: primary, bulk)');
  });
});

describe("ownstack validate (subprocess)", () => {
  const run = (args: string[]) =>
    promisify(execFile)(process.execPath, ["--import", "tsx", join(root, "src/cli.ts"), "validate", ...args], {
      cwd: root,
    }).then(
      (r) => ({ code: 0, ...r }),
      (e: { code: number; stdout: string; stderr: string }) => e,
    );

  it("exits 0 for an example", async () => {
    const res = await run(["--config", "examples/endpoint-only/ownstack.config.ts"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('stack "endpoint-only", models: primary (endpoint)');
  });

  it("exits 1 with the issue list for a bad config", async () => {
    const res = await run(["--config", "test/fixtures/configs/bad-name.config.ts"]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("name: must be 3-32 chars of a-z, 0-9 and -");
  });
}, 30_000);
