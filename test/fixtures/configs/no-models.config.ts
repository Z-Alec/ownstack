// Invalid on purpose: models is empty
import { bedrock, defineStack, endpoint, litellm, opencode } from "ownstack";

export default defineStack({
  name: "bad-no-models",
  harness: opencode({ model: "primary" }),
  gateway: litellm(),
  models: {},
});
