import { defineStack, endpoint, litellm, opencode } from "ownstack";

// Points at an OpenAI-compatible server you already run; nothing is provisioned, so no aws block.
export default defineStack({
  name: "endpoint-only",

  harness: opencode({ model: "primary" }),

  gateway: litellm(),

  models: {
    primary: endpoint({
      baseUrl: "http://gpu-box.internal:8000/v1",
      apiKeyEnv: "GPU_BOX_KEY", // name of the env var holding the key, never the key itself
    }),
  },
});
