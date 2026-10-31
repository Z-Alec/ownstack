import { bedrock, defineStack, litellm, opencode, skypilotGpu } from "ownstack";

export default defineStack({
  name: "bedrock-plus-gpu",
  aws: { region: "us-east-1", profile: "default" },

  harness: opencode({ scope: "project", model: "primary", smallModel: "bulk" }),

  gateway: litellm({
    port: 4000,
    budget: { maxUsd: 50, period: "30d" },
    fallbacks: { bulk: ["primary"] }, // while the GPU is stopped, bulk traffic goes to primary
  }),

  models: {
    // example: replace with a model enabled in your account
    primary: bedrock({ modelId: "anthropic.claude-sonnet-4-5-20250929-v1:0" }),
    bulk: skypilotGpu({
      // example: replace with a model enabled in your account
      model: "Qwen/Qwen2.5-Coder-32B-Instruct",
      cloud: "aws",
      accelerator: "L40S:1",
      idleShutdownMinutes: 30,
    }),
  },
});
