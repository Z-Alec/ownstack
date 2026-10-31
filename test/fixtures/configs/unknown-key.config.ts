// Invalid on purpose: unknown key inside a backend
import { bedrock, defineStack, endpoint, litellm, opencode } from "ownstack";

export default defineStack({
  name: "bad-unknown-key",
  aws: { region: "us-east-1" },
  harness: opencode({ model: "primary" }),
  gateway: litellm(),
  models: {
    // @ts-expect-error unknown key
    primary: bedrock({ modelId: "example.model-v1", foo: true }),
  },
});
