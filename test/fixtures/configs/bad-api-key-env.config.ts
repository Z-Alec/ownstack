// Invalid on purpose: apiKeyEnv holds a secret instead of an env var name
import { bedrock, defineStack, endpoint, litellm, opencode } from "ownstack";

export default defineStack({
  name: "bad-api-key-env",
  harness: opencode({ model: "primary" }),
  gateway: litellm(),
  models: { primary: endpoint({ baseUrl: "http://localhost:8000/v1", apiKeyEnv: "sk-live-1234" }) },
});
