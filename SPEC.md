# OwnStack — MVP Spec (working name)

2026-10-31 · @Alec Zhang

## Overview

OwnStack is an open-source CLI that turns one TypeScript config file into a self-owned coding-agent stack in the user's own cloud account: harness config, model gateway and inference backends, all removable with one command.

Problem. Teams depend on vendor subscriptions whose limits and pricing change mid-contract. The parts to self-host already exist (OpenCode, LiteLLM, vLLM, SkyPilot, Bedrock), but wiring, securing and costing them is manual work every time.

Product. ownstack up reads ownstack.config.ts, provisions what is declared, and writes the harness config so the agent talks only to the user's gateway. ownstack down removes everything it created.

MVP goals
- One command from an AWS account with Bedrock access to OpenCode running on Bedrock through a local gateway.
- Add a self-hosted open-weight model on a cloud GPU with one config entry.
- A clear cost view, a hard spend cap and automatic idle shutdown for GPUs.
- Clean teardown with no orphaned resources.

Non-goals for the MVP
- Hosted or team gateway (the gateway runs locally in Docker).
- Remote sandboxes or background agents (the harness runs on the developer's machine).
- Automatic routing by task difficulty.
- GCP, Azure, Kubernetes, or provisioning on-prem GPUs (an existing server can be pointed at, not provisioned).
- A custom TUI or a harness fork.
- Fine-tuning and RAG pipelines.

Principles
- Wrap existing tools; never rebuild what LiteLLM, SkyPilot or the harness already do.
- Every created resource is tagged and recorded in state before a command returns.
- No secret or code leaves the user's machine and accounts. No telemetry.
- The harness is never forked; OwnStack only writes its config.

## Architecture

Every harness request goes to one local LiteLLM gateway, which routes by model alias to Bedrock, a SkyPilot-managed GPU or an existing server.

The harness only sees gateway aliases, so swapping a backend never touches harness config. The CLI provisions everything on the right and records it in state for teardown.

Request flow
- OpenCode sends an OpenAI-compatible request for an alias, with the stack's virtual key.
- LiteLLM checks the key's allowed aliases and remaining budget, then calls that alias's backend.
- If a GPU alias is stopped or failing, LiteLLM falls back to primary.
- Spend is logged per key and alias; the idle watcher reads each alias's last request time.

## Stack spec

A stack is one file, ownstack.config.ts, whose default export is defineStack({...}), validated with zod at load. Model names are gateway aliases; the harness only ever sees aliases, never provider model IDs.

```ts
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
```

Field

Type

Required

Notes

name

string, [a-z0-9-]{3,32}

yes

Prefix for resource names and the ownstack:stack tag

aws.region / aws.profile

string

yes if any AWS backend

Standard AWS credential chain; OwnStack never stores AWS keys

harness

adapter

yes

MVP: opencode() only

harness.model / smallModel

alias

model yes

Must exist in models

gateway

adapter

yes

MVP: litellm() only

gateway.budget

{ maxUsd, period }

no

Applied to the stack's virtual key

gateway.fallbacks

alias to alias[]

no

Every alias must exist

models

alias to backend

yes, at least 1

Backends: bedrock, skypilotGpu, endpoint

Validation rules
- Unknown keys are errors, not warnings.
- Secrets never appear in the config; anything secret is referenced by env var name.
- Every alias referenced by the harness or fallbacks must exist in models.
- A config change re-runs as a diff against state: added models are provisioned, removed ones destroyed.

## CLI

The CLI has eight commands; up and down are idempotent and act only on what state records.

Command

What it does

ownstack init

Writes a starter ownstack.config.ts, creates .ownstack/, adds it to .gitignore

ownstack validate

Loads and validates the config; no network calls

ownstack plan

Shows what up would create, change or destroy, with estimated $/hr for GPUs

ownstack up

Provisions the diff, starts the gateway, mints the key, writes harness config, smoke-pings each alias

ownstack down

Destroys everything in state in reverse order; asks to confirm unless --yes

ownstack status

Gateway health, each backend's state (running, stopped, failed), GPU uptime

ownstack cost

Spend so far from the gateway, GPU hours x rate, and the Cost Explorer filter for billed truth

ownstack doctor

Preflight checks plus the smoke eval against every alias (see Testing)

up order
- Load and validate config; diff against .ownstack/state.json.
- Preflight: Docker running, AWS credentials resolve, SkyPilot installed and sky check passes for the cloud used, harness binary on PATH.
- Show the plan; if any GPU is new, print its estimated $/hr and require confirmation.
- Provision backends in parallel; write each resource to state as soon as it exists.
- Render the gateway config, start the gateway, wait for health.
- Mint (or reuse) the stack's virtual key with model allow-list and budget.
- Write harness config; back up any existing file first.
- Smoke-ping each alias through the gateway; report pass or fail per alias.

down order: harness config restored from backup, gateway stopped, backends destroyed, then a tag query confirms no ownstack:stack=<name> resources remain.

Local files
- .ownstack/state.json: stack name, OwnStack version, and a list of resources (kind, id, backend, region, createdAt, tags). Gitignored.
- .ownstack/secrets.env: gateway master key, virtual key, vLLM API keys. File mode 0600, gitignored, never logged.
- .ownstack/gateway/: rendered config.yaml and docker-compose.yml.
- .ownstack/backups/: harness config files as they were before up.

status and cost support --json. Non-zero exit on any failed step, with the failing step named.

## Components

Each layer is an interface with one MVP implementation; the CLI never contains backend- or harness-specific logic.

```ts
interface Backend {
  kind: "bedrock" | "skypilotGpu" | "endpoint";
  preflight(ctx: Ctx): Promise<Check[]>;
  plan(ctx: Ctx, current?: ResourceState): Promise<PlanStep[]>;
  provision(ctx: Ctx): Promise<ResourceState>;        // idempotent
  destroy(ctx: Ctx, state: ResourceState): Promise<void>;
  gatewayEntry(state: ResourceState): GatewayModelEntry; // becomes a LiteLLM model_list item
  status(ctx: Ctx, state: ResourceState): Promise<BackendStatus>;
  hourlyCostUsd?(state: ResourceState): number | undefined;
}

interface HarnessAdapter {
  name: "opencode";
  writeConfig(ctx: Ctx, gateway: GatewayInfo, aliases: AliasMap): Promise<FileChange[]>;
  restoreConfig(ctx: Ctx): Promise<void>;
  smokeTest?(ctx: Ctx): Promise<SmokeResult>;
}
```

### Gateway: LiteLLM
- Runs locally via Docker Compose: LiteLLM proxy plus Postgres, which LiteLLM needs for virtual keys and spend tracking ([source](https://docs.litellm.ai/docs/proxy/virtual_keys)).
- OwnStack renders config.yaml: one model_list entry per alias from each backend's gatewayEntry, plus fallbacks from the stack spec.
- A generated master key lives only in secrets.env. It is never written to harness config.
- One virtual key per stack, limited to the stack's aliases, with max_budget and budget period from the config. LiteLLM keys can be scoped to model groups and stop working once they've spent max_budget ([source](https://docs.litellm.ai/docs/harness/gateway.md)).
- Self-hosted models need per-token prices set in model_info, otherwise LiteLLM records zero spend for them ([source](https://llm-d.ai/docs/dev/operations/serve-external-apis/litellm)). OwnStack derives them from GPU $/hr and a configurable tokens/hr estimate, labelled as an estimate.
- Binds to 127.0.0.1 only.

### Backend: Bedrock
- Creates one application inference profile per Bedrock alias, tagged ownstack:stack=<name>. The gateway calls the profile ARN instead of the model ID, so spend appears per stack in Cost Explorer and CUR once the tag is activated ([source](https://docs.aws.eu/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html)).
- Credentials reach the LiteLLM container through the user's AWS profile (read-only mount of ~/.aws or exported env vars; pick one and document it).
- Preflight: credentials resolve, the model is enabled in the region, IAM allows invoke and inference-profile create/delete.
- destroy deletes the profiles it created.

### Backend: GPU via SkyPilot
- Renders a SkyPilot task YAML that runs vllm serve <model> on the requested accelerator. SkyPilot launches everything inside the user's own cloud account ([source](https://github.com/skypilot-org/skypilot/blob/master/README.md)).
- MVP uses a single-node cluster (sky launch), not SkyServe replicas. Replicas and autoscaling come later.
- vLLM is started with a generated API key; the key goes only to secrets.env and the gateway config.
- Idle shutdown is owned by OwnStack, not inferred: a watcher sidecar in the gateway compose reads the time of the last request for the alias. After idleShutdownMinutes with no requests, it stops the cluster through SkyPilot. SkyPilot's own autostop is a backstop only if its semantics fit a long-running server (verify first).
- While the GPU is stopped, the gateway's fallback sends that alias's traffic to primary. ownstack up restarts it.
- Cluster name ownstack-<stack>-<alias>; instances tagged ownstack:stack=<name> if SkyPilot supports labels on AWS (verify).

### Backend: existing endpoint
- No provisioning. Produces a gateway entry from baseUrl and the API key env var.
- Cost is zero unless the user sets costPerHourUsd.

### Harness: OpenCode
- Writes opencode.json with a custom provider using @ai-sdk/openai-compatible, options.baseURL pointing at the gateway, and the key as {env:OWNSTACK_KEY} ([source](https://opencode.ai/docs/providers/)).
- Sets model and small_model to ownstack/<alias>.
- Merges into an existing opencode.json rather than overwriting; the original goes to .ownstack/backups/.
- The key is never written into the file. up prints an export line and offers a .envrc snippet.
- doctor checks a reported issue where some OpenCode versions don't forward baseURL for custom openai-compatible providers ([source](https://docs.alphaneural.io/tutorials/use-alphaneural-with-opencode)).

## Cost, observability and guardrails

Cost comes from three sources, each used for what it does well. The gateway handles live control; the cloud bill is for reconciliation only, because billing data lags.

Source

What it gives

Freshness

Used for

LiteLLM spend logs

Tokens and $ per key and model (estimated for self-hosted)

Real time

Budget cap, ownstack cost live view, idle detection

SkyPilot cluster status

Uptime and $/hr per GPU cluster

Near real time

GPU cost estimate, idle shutdown

AWS Cost Explorer / CUR

Billed dollars, filtered by stack tag and inference profile

Aggregated per usage type per day ([source](https://docs.aws.eu/bedrock/latest/userguide/cost-management.html))

Reconciliation; the number on the invoice

Guardrails in the MVP
- Hard cap: the stack's virtual key stops at budget.maxUsd.
- GPU idle shutdown by the watcher, with the gateway falling back to primary.
- plan and up show estimated $/hr before creating any GPU and require confirmation.
- Optional AWS Budget with an email alert, created and tagged by OwnStack. It is not relied on to stop spend: AWS billing data updates at least once a day, and a budget action that stops an EC2 instance in an Auto Scaling Group gets it restarted ([source](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.md)).

ownstack cost output
- Gateway spend this period vs budget, per alias.
- GPU hours this period x hourly rate, per cluster.
- The Cost Explorer filter (tag key and value) to see billed totals.
- Every estimated figure labelled "estimate".

## Security and credentials

OwnStack holds no cloud credentials of its own and sends nothing outside the user's machine and accounts.
- Cloud credentials: the standard AWS credential chain and profile only. OwnStack never asks for, stores or prints AWS keys.
- Generated secrets: master key, virtual key and vLLM API keys, created with a CSPRNG, stored in .ownstack/secrets.env (mode 0600, gitignored), redacted in all logs and errors.
- Network: the gateway binds to 127.0.0.1. GPU endpoints open only the vLLM port, protected by an API key. Restricting ingress to the user's IP is a stretch goal if SkyPilot supports it.
- Least privilege: the repo ships an IAM policy document covering Bedrock invoke, inference profile create/delete/tag, and what SkyPilot needs on EC2.
- Safe teardown: down destroys only resources that are both in state and tagged with the stack name. It never deletes by name pattern alone.
- No telemetry in the MVP. If added later, it is opt-in.
- Harness files: existing harness config is backed up before any write and restored on down.

## Repo structure and tech choices

TypeScript on the current Node LTS, one npm package with a bin, pnpm for development.

Concern

Choice

Why

Config schema

zod

Typed defineStack, good error messages

Loading ownstack.config.ts

jiti (or tsx)

Load TS config without a build step

CLI framework

commander or citty

Small, typed subcommands

Shelling out

execa

Typed wrappers around docker, sky, opencode

AWS

AWS SDK v3 (@aws-sdk/client-bedrock, resource tagging)

Inference profiles, tag queries for teardown checks

YAML

yaml

Render LiteLLM and SkyPilot files

Tests

vitest

Fast, TS-native

Logging

consola or pino, with a redaction layer

No secrets in output

License

Apache-2.0 (proposed)

Patent grant; matches SkyPilot

External tools required on PATH: Docker, SkyPilot (Python, only when a GPU backend is used), and the chosen harness. doctor checks each with a fix hint.

```
ownstack/
  src/
    cli/                 # one file per command
    config/              # defineStack, zod schema, loader
    state/               # state.json, secrets.env, backups
    gateway/litellm/     # config render, compose, key API client, idle watcher
    backends/
      bedrock/
      skypilot-gpu/
      endpoint/
    harness/opencode/
    cost/
    doctor/              # preflight + smoke eval tasks
    util/                # exec wrappers, redaction, tagging
  templates/             # docker-compose.yml, sky task yaml
  examples/              # bedrock-only, bedrock-plus-gpu, endpoint-only
  policies/              # least-privilege IAM json
  test/
    unit/
    integration/         # fake backends, mock OpenAI-compatible server
    e2e/                 # opt-in, real AWS
  docs/compat-matrix.md
```

## Milestones

Five milestones, each ending in something runnable. Stop for review at the end of each.

### M0: Skeleton

CLI scaffold, config schema and loader, state and secrets files, init and validate.
- ownstack init in an empty repo creates the config, .ownstack/ and the gitignore entry
- ownstack validate passes the three example configs and fails with a clear message on an unknown key, a missing alias and a bad name
- Unit tests green in CI

### M1: Bedrock + gateway + OpenCode

The first end-to-end path, no GPUs.
- On a machine with Docker, AWS credentials and Bedrock model access, ownstack up with a Bedrock-only config finishes in under 5 minutes
- OpenCode, started in the repo, completes a small edit task using the gateway alias
- The gateway rejects requests without the virtual key and for aliases outside the stack
- With a $0.01 budget, requests are refused once spend passes it
- ownstack down removes the inference profiles, stops the gateway and restores opencode.json; a tag query finds zero stack resources
- Running up twice changes nothing the second time

### M2: GPU backend via SkyPilot, plus existing endpoints
- Adding a skypilotGpu alias and running up shows the $/hr estimate, asks for confirmation, and serves the model through the gateway
- The vLLM port rejects requests without its API key
- After idleShutdownMinutes with no traffic, the watcher stops the cluster; requests to that alias fall back to primary
- up restarts a stopped cluster; down removes it and SkyPilot shows no cluster for the stack
- An endpoint() alias pointing at an existing OpenAI-compatible server is served through the gateway with no provisioning

### M3: Status and cost
- ownstack status shows gateway health and each backend's state, with --json
- ownstack cost shows gateway spend vs budget, GPU hours x rate, and the Cost Explorer filter, with estimates labelled
- Self-hosted aliases record non-zero estimated spend in the gateway

### M4: Doctor and compatibility matrix
- ownstack doctor runs preflight plus the smoke eval against every alias and prints pass or fail per check
- Results are written as JSON and rendered into docs/compat-matrix.md (harness x model x backend)
- README covers install, the three examples, the IAM policy and teardown

After the MVP (not in scope now): Codex and Claude Code adapters, gateway deployed to AWS for teams, SkyServe replicas and autoscaling, GCP.

## Testing strategy

Most behaviour is tested without a cloud account; real AWS runs are opt-in and always end by proving teardown left nothing behind.

Layer

What

How

Unit

Schema validation, diffing, rendering of LiteLLM config, compose file, SkyPilot YAML and opencode.json

vitest with snapshot tests

Integration

CLI flows against fake backends; LiteLLM in Docker in front of a mock OpenAI-compatible server

fake backend implementing Backend; runs in CI

Security

No secret in rendered files, logs or snapshots

Test that scans outputs and fixtures for key patterns

E2E (opt-in)

Bedrock path; GPU path on the smallest supported GPU

Real AWS, OWNSTACK_E2E=1; ends with a tag query expecting zero resources

Smoke eval (doctor)

Every alias through the gateway

Three checks below

Smoke eval checks
- Plain chat completion returns text.
- Tool call round trip: the model calls a declared tool and handles its result.
- Agent task: in a temp repo with one failing unit test, the harness runs non-interactively and the test passes afterwards.

The smoke eval is the source of the compatibility matrix, so its results are stored as JSON with harness version, model, backend and date.

## Verify first, and open questions

The items below were not confirmed while writing this spec. Check each against current docs before writing code that depends on it.

Verify against current docs
- OpenCode: small_model key name, config precedence (project vs global), the non-interactive run command used by the smoke eval, and whether the custom-provider baseURL issue is fixed in the current release
- LiteLLM: calling a Bedrock application inference profile ARN as the model; the hosted_vllm/ prefix for vLLM; fallbacks syntax; how to read last-request time per model (spend logs API vs DB query)
- SkyPilot: whether autostop fires while a long-running server process is up; instance labels or tags on AWS; restricting port ingress by IP; getting $/hr from the Python API vs parsing CLI output
- vLLM: the API-key flag; per-model tool-call parser flags needed for function calling to work
- Bedrock: the API and IAM actions for creating, tagging and deleting application inference profiles; which models allow on-demand use in the chosen region

Open questions for Alec
- Final name and license (Apache-2.0 proposed)
- Keep the gateway local for the MVP, or deploy it to AWS (for example Fargate) from day one for teams?
- Is a Python dependency (SkyPilot) acceptable in a TypeScript tool, or should GPU support start with the endpoint backend only?
- First target user: a solo developer or a small team?
- Default GPU and model to ship in the examples

## Handoff notes for Claude Code

Export this doc as Markdown, save it as SPEC.md in an empty repo, and start Claude Code with the prompt below.

Working rules
- Read the whole spec first. Build one milestone at a time and stop at the end of each for review.
- Before writing code against any external tool, check its current docs for the items in "Verify first". Never rely on memory for flags, config keys or API shapes; record what you confirmed in docs/decisions.md.
- Keep backends and the harness behind their interfaces. No backend-specific code in src/cli/.
- Every cloud resource is tagged ownstack:stack=<name> and written to state before the command returns.
- Shell out to official CLIs through typed execa wrappers; prefer machine-readable output where offered.
- Never write a secret to a tracked file, a log or a snapshot. The secret-scan test must stay green.
- Each milestone ends with green unit tests, an updated README and a short note of what changed.

Suggested first prompt

```
Read SPEC.md. Then build milestone M0 only: scaffold the repo as described in
"Repo structure and tech choices", implement defineStack with the zod schema
and validation rules from "Stack spec", the state and secrets files from "CLI",
and the init and validate commands. Add the three example configs and unit tests.
Before starting, list any spec ambiguities as questions. Stop when M0's
acceptance criteria pass.
```

## Sources
- [OpenCode providers docs](https://opencode.ai/docs/providers/)
- [OpenCode custom-provider baseURL issue note (AlphaNeural docs)](https://docs.alphaneural.io/tutorials/use-alphaneural-with-opencode)
- [LiteLLM virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
- [LiteLLM gateway for agent harnesses](https://docs.litellm.ai/docs/harness/gateway.md)
- [LiteLLM cost per token for self-hosted models (llm-d docs)](https://llm-d.ai/docs/dev/operations/serve-external-apis/litellm)
- [SkyPilot README](https://github.com/skypilot-org/skypilot/blob/master/README.md)
- [vLLM on SkyPilot](https://docs.vllm.ai/deployment/frameworks/skypilot.html)
- [Bedrock application inference profiles](https://docs.aws.eu/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html)
- [Track usage and costs in Amazon Bedrock](https://docs.aws.eu/bedrock/latest/userguide/cost-management.html)
- [AWS Budgets best practices](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.md)

