# OwnStack

Turn one TypeScript config file into a self-owned coding-agent stack in your own cloud account: harness config, model gateway and inference backends, all removable with one command.

OwnStack wraps tools that already exist (OpenCode, LiteLLM, vLLM, SkyPilot, Amazon Bedrock) and does the wiring, securing and costing for you. Nothing leaves your machine and your accounts, and there is no telemetry.

> **Status: early development (milestone M0).** `init` and `validate` work today. `up`, `down`, `plan`, `status`, `cost` and `doctor` arrive in later milestones. See [SPEC.md](SPEC.md) for the full design and roadmap.

## How it works

```
OpenCode ──► LiteLLM gateway (local, Docker) ──► Bedrock inference profile
                                            ├──► vLLM on a SkyPilot GPU in your AWS account
                                            └──► an OpenAI-compatible server you already run
```

The harness only ever sees gateway aliases such as `primary` or `bulk`, so swapping a backend never touches harness config.

## Requirements

- Node.js 22 or newer
- For later milestones: Docker, AWS credentials with Bedrock access, and SkyPilot (only if you use a GPU backend)

## Quick start

```sh
pnpm install
pnpm build

cd path/to/your/repo
node /path/to/ownstack/dist/cli.js init       # writes ownstack.config.ts and .ownstack/
node /path/to/ownstack/dist/cli.js validate   # checks the config, no network calls
```

`ownstack init` writes a starter `ownstack.config.ts`, creates `.ownstack/` (state, a `0600` secrets file, gateway and backup folders) and adds `.ownstack/` to `.gitignore`.

## Config

```ts
import { defineStack, opencode, litellm, bedrock, skypilotGpu } from "ownstack";

export default defineStack({
  name: "alec-dev",
  aws: { region: "us-east-1", profile: "default" },
  harness: opencode({ scope: "project", model: "primary", smallModel: "bulk" }),
  gateway: litellm({
    port: 4000,
    budget: { maxUsd: 50, period: "30d" },
    fallbacks: { bulk: ["primary"] },
  }),
  models: {
    primary: bedrock({ modelId: "<a Bedrock model enabled in your account>" }),
    bulk: skypilotGpu({ model: "<hugging face model id>", cloud: "aws", accelerator: "L40S:1" }),
  },
});
```

Validation is strict: unknown keys are errors, every alias used by the harness or fallbacks must exist in `models`, and secrets are only ever referenced by environment variable name. See [`examples/`](examples) for a Bedrock-only stack, Bedrock plus a GPU, and an existing endpoint.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm dev validate -c examples/bedrock-only/ownstack.config.ts
```

Verified facts about external tools (flags, config keys, API shapes) are recorded in [docs/decisions.md](docs/decisions.md) before code depends on them.

## Changelog

- **M0 (skeleton):** CLI scaffold, zod config schema and loader, state and secrets files, backups, log redaction, `init` and `validate`, three example configs, unit tests and a secret-scan test.

## License

Apache-2.0
