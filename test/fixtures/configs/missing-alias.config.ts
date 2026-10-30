// Invalid on purpose: harness.model references an undefined alias
import { bedrock, defineStack, endpoint, litellm, opencode } from "ownstack";

export default defineStack({
  name: "bad-missing-alias",
  aws: { region: "us-east-1" },
  harness: opencode({ model: "primay", smallModel: "bulk" }),
  gateway: litellm(),
  models: {
    primary: bedrock({ modelId: "example.model-v1" }),
    bulk: endpoint({ baseUrl: "http://localhost:8000/v1" }),
  },
});
