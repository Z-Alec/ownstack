import { stat, readFile } from "node:fs/promises";
import { createConsola } from "consola";
import { beforeEach, describe, expect, it } from "vitest";
import { statePaths } from "../../../src/state/paths.js";
import { ensureSecret, getSecret, readSecrets, setSecret } from "../../../src/state/secrets.js";
import { createLogger } from "../../../src/util/logger.js";
import { generateKey } from "../../../src/util/random.js";
import { clearRegisteredSecrets, redact } from "../../../src/util/redact.js";
import { useTempDir } from "./helpers.js";

const tempDir = useTempDir();

function capturingLogger() {
  const lines: string[] = [];
  const consola = createConsola({
    level: 5,
    reporters: [{ log: (obj) => lines.push(obj.args.map(String).join(" ")) }],
  });
  return { log: createLogger({ consola }), lines };
}

const mode = async (p: string) => (await stat(p)).mode & 0o777;

describe("secrets", () => {
  beforeEach(() => clearRegisteredSecrets());

  it("generates CSPRNG keys with the expected shape", () => {
    const a = generateKey();
    expect(a).toMatch(/^sk-ownstack-[A-Za-z0-9_-]{43}$/);
    expect(generateKey()).not.toBe(a);
  });

  it("stores KEY=value lines with mode 0600 on every write", async () => {
    const cwd = await tempDir();
    const file = statePaths(cwd).secretsFile;
    await setSecret(cwd, "LITELLM_MASTER_KEY", "master-value-123456");
    expect(await mode(file)).toBe(0o600);
    await setSecret(cwd, "OWNSTACK_KEY", "virtual-value-123456");
    expect(await mode(file)).toBe(0o600);
    expect(await readFile(file, "utf8")).toMatch(/^LITELLM_MASTER_KEY=master-value-123456$/m);
    expect(await getSecret(cwd, "OWNSTACK_KEY")).toBe("virtual-value-123456");
    expect(await getSecret(cwd, "MISSING")).toBeUndefined();
  });

  it("ensureSecret generates once, then reuses", async () => {
    const cwd = await tempDir();
    const first = await ensureSecret(cwd, "LITELLM_MASTER_KEY");
    expect(first).toMatch(/^sk-ownstack-/);
    expect(await ensureSecret(cwd, "LITELLM_MASTER_KEY")).toBe(first);
    expect(await ensureSecret(cwd, "OTHER", () => "custom-generated-value")).toBe("custom-generated-value");
    expect((await readSecrets(cwd)).size).toBe(2);
    expect(await mode(statePaths(cwd).secretsFile)).toBe(0o600);
  });

  it("rejects bad names and multi-line values", async () => {
    const cwd = await tempDir();
    await expect(setSecret(cwd, "bad-name", "x".repeat(10))).rejects.toThrow(/Invalid secret name/);
    await expect(setSecret(cwd, "GOOD", "a\nb")).rejects.toThrow(/single-line/);
  });

  it("never lets a stored or generated secret reach logger output", async () => {
    const cwd = await tempDir();
    const generated = await ensureSecret(cwd, "LITELLM_MASTER_KEY", () => "plain-generated-secret-1");
    await setSecret(cwd, "VLLM_API_KEY", "another-plain-secret-2");
    const { log, lines } = capturingLogger();
    log.info(`master=${generated}`);
    log.error(`vllm key was another-plain-secret-2 oops`);
    log.debug(`both: ${generated} another-plain-secret-2`);
    const out = lines.join("\n");
    expect(lines).toHaveLength(3);
    expect(out).not.toContain(generated);
    expect(out).not.toContain("another-plain-secret-2");
    expect(out).toContain("[REDACTED]");
  });

  it("registers secrets that are only read from disk", async () => {
    const cwd = await tempDir();
    await setSecret(cwd, "OWNSTACK_KEY", "read-back-secret-value");
    clearRegisteredSecrets(); // simulate a fresh process
    expect(redact("read-back-secret-value")).toBe("read-back-secret-value");
    await getSecret(cwd, "OWNSTACK_KEY");
    expect(redact("key read-back-secret-value")).toBe("key [REDACTED]");
  });
});
