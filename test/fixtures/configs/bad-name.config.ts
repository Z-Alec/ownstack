// Invalid on purpose: stack name has uppercase and underscore
import { bedrock, defineStack, endpoint, litellm, opencode } from "ownstack";

export default defineStack({
  name: "My_Stack",
  harness: opencode({ model: "primary" }),
  gateway: litellm(),
  models: { primary: endpoint({ baseUrl: "http://localhost:8000/v1" }) },
});
