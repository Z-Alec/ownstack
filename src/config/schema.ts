import { z } from "zod";

export const STACK_NAME_RE = /^[a-z0-9-]{3,32}$/;
export const ALIAS_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const ENV_VAR_RE = /^[A-Z_][A-Z0-9_]*$/;
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d+$/;
const PERIOD_RE = /^[1-9][0-9]*(h|d|mo)$/;
const ACCELERATOR_RE = /^[A-Za-z0-9-]+(:[1-9][0-9]*)?$/;

const nonEmpty = z.string().trim().min(1, { error: "must not be empty" });
const aliasRef = nonEmpty;
const aliasKey = z.string().regex(ALIAS_RE, {
  error: "alias must start with a-z and contain only a-z, 0-9 and - (max 32 chars)",
});
const costPerHourUsd = z.number().nonnegative({ error: "must be >= 0" });

export const awsSchema = z.strictObject({
  region: z.string().regex(REGION_RE, { error: 'must be an AWS region such as "us-east-1"' }),
  profile: nonEmpty.optional(),
});

export const opencodeSchema = z.strictObject({
  kind: z.literal("opencode", { error: 'must be "opencode"; use opencode()' }),
  scope: z.enum(["project", "global"]).default("project"),
  model: aliasRef,
  smallModel: aliasRef.optional(),
});

export const litellmSchema = z.strictObject({
  kind: z.literal("litellm", { error: 'must be "litellm"; use litellm()' }),
  port: z.int().min(1).max(65535).default(4000),
  budget: z
    .strictObject({
      maxUsd: z.number().positive({ error: "must be a positive number" }),
      period: z.string().regex(PERIOD_RE, {
        error: 'must be a duration such as "24h", "30d" or "1mo"',
      }),
    })
    .optional(),
  fallbacks: z.record(aliasRef, z.array(aliasRef).min(1, { error: "must list at least one alias" })).optional(),
});

export const bedrockSchema = z.strictObject({
  kind: z.literal("bedrock"),
  modelId: nonEmpty,
});

export const skypilotGpuSchema = z.strictObject({
  kind: z.literal("skypilotGpu"),
  model: nonEmpty,
  cloud: z.literal("aws"),
  accelerator: z.string().regex(ACCELERATOR_RE, { error: 'must look like "L40S:1"' }),
  idleShutdownMinutes: z.int().positive().default(30),
  costPerHourUsd: costPerHourUsd.optional(),
  tokensPerHourEstimate: z.int().positive().optional(),
});

export const endpointSchema = z.strictObject({
  kind: z.literal("endpoint"),
  baseUrl: z
    .url({ protocol: /^https?$/, error: "must be an http(s) URL" })
    .refine((u) => !/^https?:\/\/[^/]*@/.test(u), {
      error: "must not contain credentials; use apiKeyEnv instead",
    }),
  apiKeyEnv: z
    .string()
    .regex(ENV_VAR_RE, { error: "must be an environment variable NAME such as GPU_BOX_KEY, not a secret" })
    .optional(),
  costPerHourUsd: costPerHourUsd.optional(),
});

export const backendSchema = z.discriminatedUnion("kind", [bedrockSchema, skypilotGpuSchema, endpointSchema]);

export const stackSchema = z
  .strictObject({
    name: z.string().regex(STACK_NAME_RE, { error: "must be 3-32 chars of a-z, 0-9 and -" }),
    aws: awsSchema.optional(),
    harness: opencodeSchema,
    gateway: litellmSchema,
    models: z.record(aliasKey, backendSchema),
  })
  .superRefine(checkReferences, {
    // Run even when other fields failed, so every issue is reported in one pass.
    when: (payload) => isRecord(payload.value),
  });

type RefCtx = z.core.$RefinementCtx<unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Cross-field checks. Input may be partially invalid, so every access is defensive. */
function checkReferences(value: unknown, ctx: RefCtx): void {
  if (!isRecord(value) || !isRecord(value.models)) return;
  const models = value.models;
  const aliases = Object.keys(models);
  if (aliases.length === 0) {
    ctx.addIssue({ code: "custom", path: ["models"], message: "must define at least one model alias" });
    return;
  }

  const defined = `(defined: ${aliases.join(", ")})`;
  const checkAlias = (alias: unknown, path: (string | number)[]) => {
    if (typeof alias !== "string" || alias.trim() === "") return;
    if (!Object.hasOwn(models, alias)) {
      ctx.addIssue({ code: "custom", path, message: `alias "${alias}" is not defined in models ${defined}` });
    }
  };

  if (isRecord(value.harness)) {
    checkAlias(value.harness.model, ["harness", "model"]);
    checkAlias(value.harness.smallModel, ["harness", "smallModel"]);
  }

  const fallbacks = isRecord(value.gateway) ? value.gateway.fallbacks : undefined;
  if (isRecord(fallbacks)) {
    for (const [from, targets] of Object.entries(fallbacks)) {
      checkAlias(from, ["gateway", "fallbacks", from]);
      if (!Array.isArray(targets)) continue;
      targets.forEach((to: unknown, i) => {
        const path = ["gateway", "fallbacks", from, i];
        if (to === from) {
          ctx.addIssue({ code: "custom", path, message: `alias "${from}" cannot fall back to itself` });
        } else {
          checkAlias(to, path);
        }
      });
    }
  }

  if (value.aws === undefined) {
    const awsAlias = aliases.find((a) => {
      const backend = models[a];
      return isRecord(backend) && (backend.kind === "bedrock" || backend.kind === "skypilotGpu");
    });
    if (awsAlias) {
      ctx.addIssue({
        code: "custom",
        path: ["aws"],
        message: `is required because models.${awsAlias} runs on AWS; add aws: { region: "..." }`,
      });
    }
  }
}

export type StackInput = z.input<typeof stackSchema>;
export type StackConfig = z.output<typeof stackSchema>;
export type BackendConfig = z.output<typeof backendSchema>;
export type OpencodeInput = z.input<typeof opencodeSchema>;
export type LitellmInput = z.input<typeof litellmSchema>;
export type BedrockInput = z.input<typeof bedrockSchema>;
export type SkypilotGpuInput = z.input<typeof skypilotGpuSchema>;
export type EndpointInput = z.input<typeof endpointSchema>;
