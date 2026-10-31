import { describe, expect, it } from "vitest";
import { bedrock, defineStack, endpoint, litellm, opencode, skypilotGpu } from "../../../src/config/define.js";
import { ConfigError, parseConfig } from "../../../src/config/loader.js";

const base = () =>
  defineStack({
    name: "test-stack",
    aws: { region: "us-east-1" },
    harness: opencode({ model: "primary" }),
    gateway: litellm(),
    models: { primary: bedrock({ modelId: "example.model-v1" }) },
  });

function issues(input: unknown): string[] {
  try {
    parseConfig(input);
  } catch (err) {
    if (err instanceof ConfigError) return err.issues;
    throw err;
  }
  throw new Error("expected config to be invalid");
}

describe("stack schema", () => {
  it("applies defaults", () => {
    const config = parseConfig(base());
    expect(config.harness.scope).toBe("project");
    expect(config.gateway.port).toBe(4000);
  });

  it("factories tag objects with kind", () => {
    expect(opencode({ model: "a" }).kind).toBe("opencode");
    expect(litellm().kind).toBe("litellm");
    expect(bedrock({ modelId: "m" }).kind).toBe("bedrock");
    expect(skypilotGpu({ model: "m", cloud: "aws", accelerator: "L4:1" }).kind).toBe("skypilotGpu");
    expect(endpoint({ baseUrl: "http://x/v1" }).kind).toBe("endpoint");
  });

  it("rejects unknown keys at the top level and in nested objects", () => {
    expect(issues({ ...base(), extra: 1 })).toEqual(['extra: unknown key "extra"']);
    expect(issues({ ...base(), gateway: { ...litellm(), budget: { maxUsd: 1, period: "1d", hard: true } } })).toEqual([
      'gateway.budget.hard: unknown key "hard"',
    ]);
  });

  it("reports every issue at once, including cross-field checks", () => {
    const result = issues({ ...base(), name: "x", harness: opencode({ model: "nope", smallModel: "also-nope" }) });
    expect(result).toEqual([
      "name: must be 3-32 chars of a-z, 0-9 and -",
      'harness.model: alias "nope" is not defined in models (defined: primary)',
      'harness.smallModel: alias "also-nope" is not defined in models (defined: primary)',
    ]);
  });

  it("checks fallback keys and self-references", () => {
    expect(issues({ ...base(), gateway: litellm({ fallbacks: { ghost: ["primary"], primary: ["primary"] } }) })).toEqual([
      'gateway.fallbacks.ghost: alias "ghost" is not defined in models (defined: primary)',
      'gateway.fallbacks.primary[0]: alias "primary" cannot fall back to itself',
    ]);
  });

  it("requires aws for skypilotGpu", () => {
    const { aws: _aws, ...rest } = base();
    const input = { ...rest, models: { primary: skypilotGpu({ model: "org/m", cloud: "aws", accelerator: "L40S:1" }) } };
    expect(issues(input)).toEqual(['aws: is required because models.primary runs on AWS; add aws: { region: "..." }']);
  });

  it("rejects bad backend kinds and untagged backends", () => {
    expect(issues({ ...base(), models: { primary: { kind: "gpu" } } })).toEqual([
      'models.primary.kind: unknown kind "gpu"; must be one of "bedrock", "skypilotGpu", "endpoint"',
    ]);
    expect(issues({ ...base(), models: { primary: { modelId: "m" } } })).toEqual([
      "models.primary.kind: is required; use bedrock(), skypilotGpu() or endpoint()",
    ]);
  });

  it("rejects invalid alias names", () => {
    expect(issues({ ...base(), models: { Primary_1: bedrock({ modelId: "m" }) }, harness: opencode({ model: "Primary_1" }) }))
      .toContain("models.Primary_1: alias must start with a-z and contain only a-z, 0-9 and - (max 32 chars)");
  });

  it("reports missing required fields", () => {
    expect(issues({ name: "abc" })).toEqual(["harness: is required", "gateway: is required", "models: is required"]);
  });

  it("validates field formats", () => {
    const result = issues({
      ...base(),
      aws: { region: "Virginia" },
      gateway: litellm({ port: 0, budget: { maxUsd: 0, period: "monthly" } }),
      models: {
        primary: endpoint({ baseUrl: "ftp://box/v1" }),
        creds: endpoint({ baseUrl: "http://user:pass@box/v1" }),
        gpu: skypilotGpu({ model: "m", cloud: "aws", accelerator: "L40S x1", idleShutdownMinutes: 0 }),
      },
    });
    expect(result).toEqual([
      'aws.region: must be an AWS region such as "us-east-1"',
      "gateway.port: Too small: expected number to be >=1",
      "gateway.budget.maxUsd: must be a positive number",
      'gateway.budget.period: must be a duration such as "24h", "30d" or "1mo"',
      "models.primary.baseUrl: must be an http(s) URL",
      "models.creds.baseUrl: must not contain credentials; use apiKeyEnv instead",
      'models.gpu.accelerator: must look like "L40S:1"',
      "models.gpu.idleShutdownMinutes: Too small: expected number to be >0",
    ]);
  });

  it("rejects a non-object default export", () => {
    expect(issues("nope")).toEqual(["(config): must be object"]);
  });
});
