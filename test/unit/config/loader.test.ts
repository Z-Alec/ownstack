import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../../src/config/loader.js";

const root = join(import.meta.dirname, "../../..");
const fixtures = join(root, "test/fixtures/configs");

async function loadError(file: string): Promise<ConfigError> {
  const err = await loadConfig(fixtures, file).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ConfigError);
  return err as ConfigError;
}

describe("examples", () => {
  it.each(["bedrock-only", "bedrock-plus-gpu", "endpoint-only"])("%s validates", async (name) => {
    const config = await loadConfig(join(root, "examples", name));
    expect(config.name).toBe(name);
    expect(config.harness.kind).toBe("opencode");
    expect(config.gateway.port).toBe(4000);
  });

  it("endpoint-only needs no aws block", async () => {
    const config = await loadConfig(join(root, "examples/endpoint-only"));
    expect(config.aws).toBeUndefined();
  });

  it("the SPEC.md example validates and gets defaults", async () => {
    const config = await loadConfig(fixtures, "spec-example.config.ts");
    expect(config.models.bulk).toMatchObject({ kind: "skypilotGpu", idleShutdownMinutes: 30 });
    expect(config.harness.scope).toBe("project");
  });
});

describe("invalid configs", () => {
  it.each([
    ["unknown-key.config.ts", 'models.primary.foo: unknown key "foo"'],
    ["missing-alias.config.ts", 'harness.model: alias "primay" is not defined in models (defined: primary, bulk)'],
    ["bad-name.config.ts", "name: must be 3-32 chars of a-z, 0-9 and -"],
    ["no-models.config.ts", "models: must define at least one model alias"],
    ["bad-api-key-env.config.ts", "models.primary.apiKeyEnv: must be an environment variable NAME"],
    ["bad-fallback.config.ts", 'gateway.fallbacks.primary[0]: alias "backup" is not defined in models (defined: primary)'],
    ["missing-aws.config.ts", "aws: is required because models.primary runs on AWS"],
  ])("%s", async (file, expected) => {
    const err = await loadError(file);
    expect(err.message).toContain(`Invalid config ${join(fixtures, file)}`);
    expect(err.message).toContain(`  - ${expected}`);
    expect(err.issues).toHaveLength(1);
  });

  it("reports a missing file", async () => {
    const err = await loadError("does-not-exist.config.ts");
    expect(err.message).toMatch(/^Config file not found: /);
  });

  it("reports a missing default export", async () => {
    const err = await loadError("no-default.config.ts");
    expect(err.message).toContain("has no default export");
  });
});
