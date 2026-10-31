// Verbatim copy of the example in SPEC.md ("Stack spec"); must typecheck and validate.
import { defineStack, opencode, litellm, bedrock, skypilotGpu, endpoint } from "ownstack";

export default defineStack({
  name: "alec-dev",                          // used in resource names and the ownstack:stack tag
  aws: { region: "us-east-1", profile: "default" },

  harness: opencode({
    scope: "project",                         // writes ./opencode.json (or "global")
    model: "primary",                         // alias for the main model
    smallModel: "bulk",                       // alias for cheap/background calls
  }),

  gateway: litellm({
    port: 4000,
    budget: { maxUsd: 50, period: "30d" },    // hard cap on the stack's virtual key
    fallbacks: { bulk: ["primary"] },         // if bulk is down, use primary
  }),

  models: {
    primary: bedrock({ modelId: "<bedrock model id>" }),
    bulk: skypilotGpu({
      model: "<hugging face model id>",
      cloud: "aws",
      accelerator: "L40S:1",
      idleShutdownMinutes: 30,
      costPerHourUsd: undefined,              // optional override, else read from SkyPilot
    }),
    // or point at a server you already run:
    // bulk: endpoint({ baseUrl: "http://gpu-box:8000/v1", apiKeyEnv: "GPU_BOX_KEY" }),
  },
});

void endpoint;
