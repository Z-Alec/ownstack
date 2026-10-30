import { bedrock, defineStack, litellm, opencode } from "ownstack";

export default defineStack({
  name: "bedrock-only",
  aws: { region: "us-east-1", profile: "default" },

  harness: opencode({ model: "primary", smallModel: "fast" }),

  gateway: litellm({
    port: 4000,
    budget: { maxUsd: 25, period: "30d" },
    fallbacks: { fast: ["primary"] },
  }),

  models: {
    // example: replace with a model enabled in your account
    primary: bedrock({ modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0" }),
    // example: replace with a model enabled in your account
    fast: bedrock({ modelId: "anthropic.claude-haiku-4-5-20251001-v1:0" }),
  },
});
