import { describe, expect, it } from "vitest";
import { run, which } from "../../../src/util/exec.js";
import { registerSecret } from "../../../src/util/redact.js";

describe("exec", () => {
  it("returns output of a successful command", async () => {
    const r = await run(process.execPath, ["-e", "console.log('hi')"]);
    expect(r).toEqual({ stdout: "hi", stderr: "", exitCode: 0 });
  });

  it("redacts secrets in failure messages and never includes env", async () => {
    registerSecret("exec-secret-value-xyz");
    const err = await run(
      process.execPath,
      ["-e", "console.error('leaked ' + process.env.MY_TOKEN); process.exit(3)"],
      { env: { MY_TOKEN: "exec-secret-value-xyz" } },
    ).then(
      () => expect.fail("expected failure"),
      (e: unknown) => e as Error & { exitCode: number },
    );
    expect(err.exitCode).toBe(3);
    expect(err.message).toContain("leaked [REDACTED]");
    expect(err.message).not.toContain("exec-secret-value-xyz");
    expect(err.message).not.toContain("MY_TOKEN=");
  });

  it("reports a missing binary as an error", async () => {
    await expect(run("definitely-not-a-real-binary-ownstack")).rejects.toThrow(/definitely-not-a-real-binary/);
  });

  it("which finds binaries on PATH", async () => {
    expect(await which("node")).toMatch(/node$/);
    expect(await which("definitely-not-a-real-binary-ownstack")).toBeUndefined();
  });
});
