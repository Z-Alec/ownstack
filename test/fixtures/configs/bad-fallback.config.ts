// Invalid on purpose: fallback points at an undefined alias
import { bedrock, defineStack, endpoint, litellm, opencode } from "ownstack";

export default defineStack({
  name: "bad-fallback",
  harness: opencode({ model: "primary" }),
  gateway: litellm({ fallbacks: { primary: ["backup"] } }),
  models: { primary: endpoint({ baseUrl: "http://localhost:8000/v1" }) },
});
