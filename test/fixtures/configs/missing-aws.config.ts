// Invalid on purpose: bedrock backend without an aws block
import { bedrock, defineStack, endpoint, litellm, opencode } from "ownstack";

export default defineStack({
  name: "bad-missing-aws",
  harness: opencode({ model: "primary" }),
  gateway: litellm(),
  models: { primary: bedrock({ modelId: "example.model-v1" }) },
});
