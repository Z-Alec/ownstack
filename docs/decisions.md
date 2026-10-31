# OwnStack: verified decisions ("Verify first")

Researched 2026-10-30 against current primary sources (official docs, published packages, upstream source). Every answer cites a URL. Where docs were silent, the installed source of the current release was read instead, and the file path is given. **Status** is one of CONFIRMED, UNCONFIRMED or CONTRADICTS SPEC. Each item ends with an **Implication** line: what OwnStack code should do.

Versions current on 2026-10-30:

| Tool | Version | Source |
|---|---|---|
| OpenCode v1 (`opencode-ai` on npm) | 1.19.5 (2026-10-28) | `npm view opencode-ai` |
| OpenCode v2 (`@opencode/cli` on npm) | 2.2.3 (2026-10-30; 2.0.0 shipped 2026-09-11) | `npm view @opencode/cli`, https://opencode.ai/v2/docs/ |
| LiteLLM | 1.106.6 (PyPI, 2026-10-28); image `ghcr.io/berriai/litellm:v1.106.6` exists | https://pypi.org/project/litellm/ , ghcr manifest check |
| SkyPilot | 0.14.2 (PyPI, 2026-10-28); nightly is 1.0.0.dev20261030 | https://pypi.org/project/skypilot/ |
| vLLM | 0.32.0 (PyPI, 2026-10-18) | https://pypi.org/project/vllm/ |
| AWS SDK v3 `@aws-sdk/client-bedrock` | 3.1160.0 | `npm pack @aws-sdk/client-bedrock` |

---

## 1. OpenCode

> **The headline finding:** OpenCode 2 is now GA (`@opencode/cli` 2.2.3) and has a different native config schema. Both majors install the same `opencode` binary and read the same config locations. Per the official migration guide, V2 still accepts V1-format config. OwnStack has to handle both.

### 1.1 Small-model key
- **Answer:** V1 uses top-level `"small_model": "provider/model"`, described as "a separate model for lightweight tasks like title generation". V2 has no `small_model` in its native schema. V2 still accepts V1 `small_model` and "normalizes [it] without warning": it "becomes the `model` selection for the built-in `title` agent. Native V2 configuration should use `agents.title.model` instead."
- **Sources:** https://opencode.ai/docs/config/#models , https://opencode.ai/v2/docs/migrate-v1/ ("Supported fields without direct native equivalents"), https://opencode.ai/v2/docs/models (no small_model)
- **Status:** CONFIRMED. The spec says "small_model". That is right for V1 but only a legacy alias in V2.
- **Implication:** For V1, write `small_model: "ownstack/<alias>"`. For a native V2 file, write `agents: { title: { model: "ownstack/<alias>" } }`. In V2, `small_model` only sets the title agent, so `smallModel` means less in V2 than the spec implies.

### 1.2 Custom OpenAI-compatible provider
- **Answer (V1, opencode.json):**
  ```json
  { "$schema": "https://opencode.ai/config.json",
    "provider": { "ownstack": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OwnStack",
      "options": { "baseURL": "http://127.0.0.1:4000/v1", "apiKey": "{env:OWNSTACK_KEY}" },
      "models": { "primary": { "name": "primary", "limit": { "context": 200000, "output": 65536 } } } } },
    "model": "ownstack/primary", "small_model": "ownstack/bulk" }
  ```
  `{env:VAR}` is substituted, and an unset variable becomes an empty string. The docs say to use `@ai-sdk/openai-compatible` for `/v1/chat/completions`.
- **Answer (V2 native, opencode.json or opencode.jsonc):**
  ```json
  { "providers": { "ownstack": {
      "name": "OwnStack",
      "package": "aisdk:@ai-sdk/openai-compatible",
      "settings": { "baseURL": "http://127.0.0.1:4000/v1", "apiKey": "{env:OWNSTACK_KEY}" },
      "models": { "primary": { "name": "primary" } } } },
    "model": "ownstack/primary", "agents": { "title": { "model": "ownstack/bulk" } } }
  ```
  The migration guide's mapping: "V1 `npm` becomes `package`, and AI SDK packages receive the `aisdk:` prefix. `api` becomes `settings.baseURL`. Provider `options` are separated into `settings`, `headers`, and `body`." V2 also has a native package, `@opencode/ai/providers/openai-compatible`, plus an `env: ["VAR"]` list for credentials.
- **Mixing formats:** "it does not recursively infer formats inside individual agents, providers, commands, or models. Keep each of those nested entries entirely in one format."
- **Sources:** https://opencode.ai/docs/providers/ (custom provider), https://opencode.ai/docs/config/#variables , https://opencode.ai/v2/docs/providers#custom , https://opencode.ai/v2/docs/config#variables , https://opencode.ai/v2/docs/migrate-v1/#providers
- **Status:** CONFIRMED for both majors.
- **Implication:** Detect the major version (`opencode --version`). Write the native block for that version, and keep the `ownstack` provider entry entirely in one format.

### 1.3 Config precedence and merge
- **Answer:** Config files are **merged, not replaced**: "Later configs override earlier ones only for conflicting keys". The V1 order, from low to high, is: remote `.well-known/opencode`, global `~/.config/opencode/opencode.json`, `OPENCODE_CONFIG`, project `opencode.json` (searched from cwd up to the nearest git dir), `.opencode` dirs, `OPENCODE_CONFIG_CONTENT`, managed files (`/etc/opencode/` on Linux, `/Library/Application Support/opencode/` on macOS), then macOS MDM. V2 is the same in spirit. It searches from cwd to the filesystem root and merges direct `opencode.json(c)` files from farthest to closest. Then `.opencode/opencode.json(c)` files, so "every discovered `.opencode` config overrides every direct config". The system dir and managed prefs win over everything.
- **Sources:** https://opencode.ai/docs/config/#locations , https://opencode.ai/v2/docs/config#locations , https://opencode.ai/v2/docs/migrate-v1/#use-your-existing-configuration
- **Status:** CONFIRMED.
- **Implication:** Writing `./opencode.json` (scope "project") is right. Doctor should warn when any of these could shadow or block OwnStack's settings: a `.opencode/opencode.json`, a system or managed config, `enabled_providers`/`disabled_providers`, or `policies` (V2). `opencode debug config` lists the config sources in both majors.

### 1.4 Non-interactive run command (for the smoke eval)
- **Answer:** In both majors it is `opencode run [message..]`. The flags OwnStack needs are `--model/-m provider/model`, `--format json` (V1: "raw JSON events"; V2: "newline-delimited JSON"), `--auto` (auto-approve permissions that are not explicitly denied), `--agent`, `--dir` (V1), and `--continue/--session/--file`. V2 adds `--standalone` (run a private server).
- **Sources:** https://opencode.ai/docs/cli/ (run flags table), https://opencode.ai/v2/docs/cli/commands/#run
- **Status:** CONFIRMED.
- **Implication:** Smoke eval: `opencode run --model ownstack/<alias> --format json --auto "<task>"` with cwd set to the temp repo. On V2, also pass `--standalone` (see 1.6).

### 1.5 Custom-provider baseURL-not-forwarded issue
- **Answer:** 
  - V1: issue **anomalyco/opencode#5674**, "Custom OpenAI-compatible provider options not being passed to API calls", reported on 1.0.164. It is **closed as not planned**; the maintainer could not reproduce it ("I don't think there is an option-forwarding bug here").
  - V2 pre-release: issue **#36834** (`opencode2 v0.0.0-next-15363`) said `settings.baseURL` was not forwarded to `aisdk:@ai-sdk/openai-compatible` and that V1-spelled `options.baseURL` was "ignored entirely". It is **closed**. The page names no fix PR or release.
  - V2 2.0.15: **#51285** reports that config-declared `providers` never materialize in the registry. Its state was not confirmed.
  - The AlphaNeural page the spec cites still calls the problem "an open issue" but names no version.
- **Sources:** https://github.com/anomalyco/opencode/issues/5674 , https://github.com/anomalyco/opencode/issues/36834 , https://github.com/anomalyco/opencode/issues/51285 , https://docs.alphaneural.io/tutorials/use-alphaneural-with-opencode
- **Status:** UNCONFIRMED whether any current release is affected. No open, confirmed bug exists for 1.19.5 or 2.2.3. The repo is now `anomalyco/opencode` (was `sst/opencode`).
- **Implication:** Keep the doctor check, but make it empirical. Run the smoke eval against the gateway and assert that the gateway logged the request (by checking spend logs for the alias). If no request arrived, report "harness did not use gateway baseURL" with the detected harness version. Do not hardcode version ranges.

### 1.6 V2 runs a background service (new; affects `{env:OWNSTACK_KEY}`)
- **Answer:** V2 has `opencode service start|stop|set env KEY VALUE`. The CI docs say: "pass a provider API key as a secret and use standalone mode so the private server receives it".
- **Source:** https://opencode.ai/v2/docs/cli/commands/ (run → CI; service)
- **Status:** CONFIRMED that the docs say this. Whether `{env:...}` is resolved by the background service, not the CLI process, is inferred from that text and not tested.
- **Implication:** On V2, an `export OWNSTACK_KEY=...` in the user's shell may not reach an already-running background service. `up` should print both options: restart the service with the env set, or use `opencode service set env OWNSTACK_KEY ...`. The smoke eval should use `--standalone`. As a V2-only alternative, `{file:.ownstack/...}` substitution keeps the key out of `opencode.json` and does not depend on env.

---

## 2. LiteLLM proxy

### 2.1 Bedrock application inference profile ARN
- **Answer (documented form):**
  ```yaml
  - model_name: primary
    litellm_params:
      model: bedrock/<base model id, e.g. us.anthropic.claude-...>   # used for routing + price lookup
      model_id: arn:aws:bedrock:<region>:<acct>:application-inference-profile/<id>  # what Bedrock is called with
      aws_region_name: <region>
  ```
  The docs say: "You have to set the ARN application inference profile in the `model_id` parameter." A bare `model: bedrock/<arn>` also works in the source. `is_bedrock_application_inference_profile_arn()` routes such ARNs to Converse, and ARNs are URL-encoded. But then the base model is hidden, so LiteLLM cannot look up its price, and capability gates are skipped (the comment in `converse_transformation.py` says so).
- **Credential params:** `aws_access_key_id`, `aws_secret_access_key`, `aws_session_token`, `aws_region_name`, `aws_session_name`, `aws_profile_name`, `aws_role_name`, `aws_web_identity_token`, `aws_bedrock_runtime_endpoint` and `api_key` (Bedrock bearer token). `aws_profile_name` maps to `boto3.Session(profile_name=...)`. With nothing set, LiteLLM falls back to `boto3.Session()`, the default credential chain (`AWS_PROFILE`, env vars, `~/.aws`).
- **Sources:** https://docs.litellm.ai/docs/providers/bedrock#bedrock-application-inference-profile , source `litellm/llms/bedrock/base_aws_llm.py` (`get_credentials`, `_auth_with_aws_profile`, `get_bedrock_model_id`) and `litellm/llms/bedrock/common_utils.py` in litellm 1.106.6
- **Status:** CONFIRMED.
- **Implication:** `gatewayEntry` should emit `model: bedrock/<modelId the user configured>` plus `model_id: <profile ARN>`, so spend is priced from LiteLLM's cost map. For credentials, mount `~/.aws` read-only into the container and set `AWS_PROFILE`/`aws_profile_name` to `aws.profile`. Caveat (UNCONFIRMED): SSO profiles may need a writable `~/.aws/sso/cache` to refresh tokens, so document env-var export as the fallback.

### 2.2 vLLM via `hosted_vllm/`
- **Answer:** `model: hosted_vllm/<served-model-name>`, `api_base: http(s)://host:port/v1`, `api_key: os.environ/VAR`. The docs show `hosted_vllm/` with `api_base`. `api_key` is a generic litellm_param.
- **Source:** https://docs.litellm.ai/docs/providers/vllm
- **Status:** CONFIRMED (the docs example shows no `/v1` suffix and no api_key; that the vLLM API key passes through as `api_key` is standard, not shown in that example).
- **Implication:** Use `hosted_vllm/<model>` and the vLLM key from `secrets.env` via `os.environ/`. Also set `timeout`/`stream_timeout` on GPU entries, because a stopped instance's IP may hang the TCP connection rather than refuse it, and that delays fallback.

### 2.3 Fallbacks syntax
- **Answer:** `fallbacks: [{"bulk": ["primary"]}]`, a list of single-key dicts mapping a model_group to an ordered list of groups. The docs place it under `litellm_settings:`. The source also accepts it under `router_settings:`, because any `Router.__init__` arg is valid there. Related router settings: `num_retries`, `allowed_fails`, `cooldown_time` (seconds). The proxy passes `fallback_access_check`/`fallback_budget_check` to the Router, so the key must be allowed on the fallback group too.
- **Sources:** https://docs.litellm.ai/docs/proxy/reliability , source `litellm/proxy/proxy_server.py` (router_settings handling)
- **Status:** CONFIRMED.
- **Implication:** Render `router_settings: { fallbacks: [...], num_retries: 0-1, allowed_fails: 1, cooldown_time: 60 }`. The virtual key's `models` must include every fallback target. This already holds, since the key gets all stack aliases.

### 2.4 Virtual keys
- **Answer:** `POST /key/generate` with `Authorization: Bearer <master_key>`. The body fields (from `GenerateRequestBase`/`KeyRequestBase`) include `models: []`, `max_budget: float`, `budget_duration: str`, `duration`, `key_alias`, `metadata`, `tpm_limit`, `rpm_limit`, `model_max_budget`, `soft_budget`, and `key` (a caller-supplied key value).
  - `budget_duration` format: `<n>s|m|h|d|w|mo`, e.g. `"30d"` or `"1mo"`.
  - **Past max_budget:** the key check is `spend >= max_budget` *before* each request, so the request that crosses the line still completes. Requests after that are rejected with `BudgetExceededError` "Budget has been exceeded! Key=…", HTTP **422** by default. The `litellm.budget_exceeded_status_code` comment says "set to 429 to restore the pre-422 budget_exceeded response code".
  - **Model outside the key's list:** `ModelAccessDeniedProxyException`, HTTP **403** ("key not allowed to access model … can only access models=[…]").
  - Zero-cost models: if `input_cost_per_token` and `output_cost_per_token` are both *explicitly 0*, LiteLLM skips **all** budget checks for that model.
- **Sources:** https://docs.litellm.ai/docs/proxy/virtual_keys , https://docs.litellm.ai/docs/proxy/custom_pricing#zero-cost-models-bypass-budget-checks , source `litellm/proxy/_types.py`, `litellm/litellm_core_utils/duration_parser.py`, `litellm/proxy/auth/auth_checks.py`, `litellm/__init__.py` (litellm 1.106.6)
- **Status:** CONFIRMED. Partly contradicts spec wording: the cap is not exact (one request can overshoot), and the error is 422, not 429.
- **Implication:** Mint with `{ key: <CSPRNG "sk-…">, key_alias: "ownstack-<stack>", models: [aliases], max_budget, budget_duration }`. Supplying `key` makes the mint idempotent, so it can be reused across `up` runs. Map `gateway.budget.period` to the LiteLLM duration grammar. M1 tests should expect 422 and 403. Never give a self-hosted alias explicit 0/0 pricing, or it bypasses the cap; an endpoint with no `costPerHourUsd` should leave pricing unset rather than 0.

### 2.5 master_key and DATABASE_URL
- **Answer:** Set `general_settings.master_key` (or env `LITELLM_MASTER_KEY`); it "must start with `sk-`". Set `DATABASE_URL=postgresql://user:pass@host:port/db`. `LITELLM_SALT_KEY` encrypts stored credentials and falls back to the master key if unset (source `proxy/common_utils/encrypt_decrypt_utils.py`).
- **Sources:** https://docs.litellm.ai/docs/proxy/virtual_keys , source `litellm/proxy/proxy_server.py`
- **Status:** CONFIRMED (salt-key behaviour from source only).
- **Implication:** Generate `sk-` + random for the master key, plus a separate `LITELLM_SALT_KEY`, both in `secrets.env`. The salt key must never change after first start.

### 2.6 Docker image and compose
- **Answer:** Images are `ghcr.io/berriai/litellm`, mirrored at `docker.litellm.ai/berriai/litellm`. The deploy docs say: use `ghcr.io/berriai/litellm` "for monolithic deployments, including those with Postgres" and "pin a version tag". Tag `v1.106.6` exists, as do `main-stable` and `main-latest`. The repo's `docker-compose.yml` uses `docker.litellm.ai/berriai/litellm:main-stable` with `DATABASE_URL: postgresql://llmproxy:…@db:5432/litellm`, `STORE_MODEL_IN_DB: "True"` and `env_file: .env`. Its healthcheck calls `http://localhost:4000/health/liveliness`. The `db` service is `postgres:16` with `pg_isready` and a named volume. The upstream file also publishes Postgres on `5432:5432` and adds Prometheus.
- **Sources:** https://docs.litellm.ai/docs/proxy/deploy , https://raw.githubusercontent.com/BerriAI/litellm/main/docker-compose.yml , ghcr manifest HEAD for `berriai/litellm:v1.106.6` (200)
- **Status:** CONFIRMED.
- **Implication:** Pin `ghcr.io/berriai/litellm:v1.106.6`. Bind `127.0.0.1:4000:4000` and **do not publish Postgres** (upstream maps it to all interfaces). Drop Prometheus and `STORE_MODEL_IN_DB`, and mount `config.yaml` with `--config`.

### 2.7 Health endpoints
- **Answer:** Unauthenticated: `/health/liveliness` (legacy name) and `/health/liveness`; `/health/readiness` (returns DB status and 503 when the DB is unavailable). `/health` needs auth and *makes a call to every model*: its docstring says "USE `/health/liveliness` to health check the proxy".
- **Source:** source `litellm/proxy/health_endpoints/_health_endpoints.py` (1.106.6). The repo compose healthcheck uses `/health/liveliness`.
- **Status:** CONFIRMED.
- **Implication:** Wait for `/health/readiness` == 200 after `up`. Never poll `/health` from `status`, because each call bills real Bedrock and GPU requests.

### 2.8 Per-token prices for self-hosted models
- **Answer:** `model_info: { input_cost_per_token, output_cost_per_token }` is documented. The same keys are also accepted in `litellm_params` (the `CUSTOM PRICING` block in `types/router.py`). There is also `model_info.cost_per_second` (since v1.105.0), which multiplies the full request duration and is ignored when per-token pricing is set.
- **Source:** https://docs.litellm.ai/docs/proxy/custom_pricing
- **Status:** CONFIRMED.
- **Implication:** Put the derived `input_cost_per_token`/`output_cost_per_token` in `model_info`, labelled as an estimate. `cost_per_second` = GPU $/hr ÷ 3600 is a simpler alternative, but it charges request time, not idle time, so it is also only an estimate.

### 2.9 Last request time per model (idle watcher)
- **Answer:** 
  - API: `GET /spend/logs/v2` (paginated; admin key). Its query params include `model_group`, `model`, `api_key`, `key_alias`, `start_date`, `end_date`, `page`, `page_size` (≤1000), `sort_by` (default `startTime`), `sort_order` (default `desc`), `status_filter` and `exclude_internal_health_checks`. Legacy `GET /spend/logs` truncates and points to v2.
  - DB: table `"LiteLLM_SpendLogs"` has columns `request_id`, `api_key` (hashed), `spend`, `total_tokens`, `prompt_tokens`, `completion_tokens`, `"startTime"`, `"endTime"`, `model`, `model_id`, `model_group` (the public alias), `custom_llm_provider`, `api_base`, `status`, `metadata` and others. It is indexed on `startTime`.
  - Spend writes are batched every `PROXY_BATCH_WRITE_AT` = 10 s by default (env or `general_settings.proxy_batch_write_at`).
- **Sources:** source `litellm/proxy/spend_tracking/spend_management_endpoints.py`, `litellm/proxy/schema.prisma`, `litellm/constants.py` (1.106.6)
- **Status:** CONFIRMED (from source; the docs page was not fetched).
- **Implication:** The watcher should call `GET /spend/logs/v2?model_group=<alias>&page_size=1&sort_by=startTime&sort_order=desc&exclude_internal_health_checks=true&start_date=…&end_date=…` with the master key. A direct DB fallback is `SELECT max("startTime") FROM "LiteLLM_SpendLogs" WHERE model_group=$1`. Allow about 10 s of lag. Requests that fell back to `primary` are logged under `primary`, so a stopped GPU correctly stays "idle".

---

## 3. SkyPilot

### 3.1 Does autostop fire while `vllm serve` runs?
- **Answer:** **No, not by default.** "A cluster is considered idle if there are no in‑progress jobs (pending or running) and no active SSH sessions." The `run:` command is a job, and `vllm serve` never exits, so the default `wait_for: jobs_and_ssh` (and also `jobs`) never reaches idle. `wait_for: none` means "Wait for nothing; autostop right after `idle_minutes`": a hard time limit regardless of traffic. YAML: `resources.autostop: {idle_minutes: N, down: bool, wait_for: jobs_and_ssh|jobs|none}`. CLI: `sky autostop <c> -i N [--down] [--wait-for …]`. Autostop logic runs on the cluster itself.
- **Source:** https://docs.skypilot.ai/en/latest/reference/auto-stop.html
- **Status:** CONFIRMED. This backs the spec's choice of an OwnStack-owned watcher.
- **Implication:** The watcher is the only traffic-aware idle stop. An optional backstop for a crashed laptop or watcher is `autostop: {idle_minutes: <long, e.g. 12h>, wait_for: none}`. That is a hard cap on uptime, so `up` must re-arm it on restart and the user must be warned.

### 3.2 Instance tags on AWS
- **Answer:** `resources.labels: {key: value}` maps to "instance tags" on AWS. "Labels are applied only on the first launch of the cluster. They are not updated on subsequent launches." The AWS key validator allows any non-whitespace key of 1-127 characters that does not start with `aws:`, so `ownstack:stack` is valid. The source applies the tags to instances and EBS volumes (volume tagging needs `ec2:CreateTags` on volumes; if denied, SkyPilot warns and launches the volumes untagged). The SkyPilot-created security group gets only `skypilot=true`.
- **Sources:** https://docs.skypilot.ai/en/latest/reference/yaml-spec.html#resources-labels , https://docs.skypilot.ai/en/latest/cloud-setup/cloud-permissions/aws.html , source `sky/clouds/aws.py` (`is_label_valid`) and `sky/provision/aws/instance.py` (skypilot 0.14.2)
- **Status:** CONFIRMED.
- **Implication:** Set `resources.labels: { "ownstack:stack": <name>, "ownstack:alias": <alias> }`. The teardown tag query will find instances and volumes but **not** the `sky-sg-<cluster>` security group. Grant volume `CreateTags` so volumes are tagged.

### 3.3 Restricting port ingress by source IP
- **Answer:** There is no option. When `resources.ports` is set, SkyPilot creates the per-cluster SG `sky-sg-<cluster>` and opens each port with a hardcoded `CidrIp: 0.0.0.0/0`. SSH (22) is also opened to 0.0.0.0/0. The only lever is `aws.security_group_name` in `~/.sky/config.yaml` (a string, or a list of `{cluster-glob: sg}`). With it set, SkyPilot **skips opening ports**, warning "Please make sure the specified security group has requested ports setup".
- **Sources:** source `sky/provision/aws/instance.py` (`open_ports`), `sky/provision/aws/config.py`, `sky/clouds/aws.py` (skypilot 0.14.2)
- **Status:** CONFIRMED (no native CIDR option). See 4.1 for why this matters more than the spec assumes.
- **Implication:** Do not expose `ports:` publicly. Options, best first: (a) no `ports:`; the gateway reaches vLLM through an SSH tunnel (`ssh -L` via SkyPilot's ssh config), which also keeps vLLM's unauthenticated routes private; (b) a user-provided SG via `aws.security_group_name` with an ingress rule for only the user's IP; (c) after launch, revoke 0.0.0.0/0 on `sky-sg-<cluster>` and authorize `<ip>/32` with the EC2 API, which needs extra EC2 permissions and is racy.

### 3.4 Getting $/hr
- **Answer:** 
  - Python SDK (client-server; calls return a request id): `sky.get(sky.status([name]))` returns records whose `handle.launched_resources.get_cost(3600)` gives the $/hr. `Resources.get_cost(seconds)` "Returns cost in USD for the runtime in seconds".
  - `sky.catalog.get_hourly_cost(instance_type, use_spot, region, zone)` gives the catalog price.
  - `sky.get(sky.cost_report(days))` returns `total_cost`, `duration` and `usage_intervals` per cluster.
  - `sky launch --dryrun` exists (prints the optimizer's cost table).
- **Sources:** source `sky/client/sdk.py` (`status`, `cost_report`, `get`), `sky/resources.py` (`get_cost`), `sky/catalog/__init__.py` (`get_hourly_cost`), skypilot 0.14.2
- **Status:** CONFIRMED.
- **Implication:** Ship a small Python helper, run with SkyPilot's interpreter, that prints JSON: `{instance_type, region, hourly: launched_resources.get_cost(3600)}`. Use the catalog lookup for `plan` before a cluster exists. Do not parse tables.

### 3.5 `sky stop` vs `sky down`
- **Answer:** `stop`: "Data on attached disks is not lost when a cluster is stopped. Billing for the instances will stop, while the disks will still be charged." Spot clusters cannot be stopped. `down` terminates the instances, and "any data on the attached disks will be lost". Restart with `sky start` (or `sky launch` again).
- **Source:** source `sky/client/cli/command.py` (`stop`/`down` help text), skypilot 0.14.2
- **Status:** CONFIRMED.
- **Implication:** The idle watcher should call `sky stop` (EBS still costs money; `ownstack cost` should say so). `ownstack down` should call `sky down`. `up` restarts a stopped cluster with `sky start` (or relaunch). Stopping disables spot.

### 3.6 Machine-readable output
- **Answer:** `sky status -o json` (excludes `handle` and `credentials`; includes `status`, `autostop`, `to_down`, `region`, `accelerators`, `labels`, `launched_at` and more), `sky cost-report -o json`, `sky check -o json`, and `sky status --endpoint <port>`/`--ip`. The SDK functions in `sky/client/sdk.py` (`launch`, `stop`, `down`, `autostop`, `status`, `cost_report`) return a request id that is resolved with `sky.get()`.
- **Sources:** source `sky/client/cli/flags.py` (`output_format_option`), `sky/client/cli/command.py`, `sky/schemas/api/responses.py` (`StatusResponse`)
- **Status:** CONFIRMED.
- **Implication:** Use `sky status <cluster> -o json` for `status`, and the Python helper (3.4) only for $/hr.

---

## 4. vLLM

### 4.1 API-key flag
- **Answer:** `--api-key <key>` or env `VLLM_API_KEY`. **However:** it "only authenticates endpoints under the `/v1`, `/v2`, and `/inference` path prefixes" (the security page adds `/cohere`). `/invocations` "routes to the same inference functions as `/v1`" and stays **unauthenticated**, as do `/pause`, `/abort_requests`, `/score`, `/rerank`, `/classify`, `/pooling` and others. "Do not rely on `--api-key` alone to secure vLLM". The recommended mitigation is a reverse proxy that allowlists endpoints.
- **Sources:** https://docs.vllm.ai/en/latest/cli/serve/#-api-key , https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/docs/usage/security.md , https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/vllm/envs.py
- **Status:** **CONTRADICTS SPEC.** The spec says "GPU endpoints open only the vLLM port, protected by an API key". With the port at 0.0.0.0/0 (3.3), anyone can run unauthenticated inference on the user's GPU through `/invocations`.
- **Implication:** Pass the key via `VLLM_API_KEY` in the task `envs` (it then does not appear in the process args) **and** do one of: bind vLLM to `127.0.0.1` and reach it over an SSH tunnel (preferred), or run a reverse proxy (Caddy or nginx) in the task on the opened port that forwards only `/v1/*` and checks the key. Make IP restriction (3.3) a requirement, not a stretch goal.

### 4.2 Tool calling flags and parsers
- **Answer:** Both `--enable-auto-tool-choice` (marked **mandatory** for auto tool choice) and `--tool-call-parser <name>` are needed; a parser is "Required for --enable-auto-tool-choice". Parsers for common open-weight coding models:

  | Model family | `--tool-call-parser` | Notes |
  |---|---|---|
  | Qwen3-Coder (`Qwen/Qwen3-Coder-30B-A3B-Instruct`, `-480B-A35B-`) | `qwen3_xml` | |
  | Qwen2.5 / QwQ | `hermes` | |
  | gpt-oss (`openai/gpt-oss-20b`, `-120b`) | `openai` | |
  | Llama 3.1/3.2/4 (JSON) | `llama3_json` | the docs recommend a chat template |
  | Llama 4 pythonic | `llama4_pythonic` | with `examples/tool_chat_template_llama4_pythonic.jinja` |
  | DeepSeek-V3 / V3.1 | `deepseek_v3` / `deepseek_v31` | with a chat template |
  | Kimi-K2 | `kimi_k2` | |
  | GLM-4.5 / 4.7 | `glm45` / `glm47` | |
  | Mistral | `mistral` | |
  | Generic, from the checkpoint's template | `hf` | |
- **Source:** https://raw.githubusercontent.com/vllm-project/vllm/v0.32.0/docs/features/tool_calling.md , https://docs.vllm.ai/en/latest/cli/serve/#-tool-call-parser
- **Status:** CONFIRMED (vLLM 0.32.0).
- **Implication:** `skypilotGpu` needs a `toolCallParser` (and optional `chatTemplate`), taken from a built-in table keyed by HF model-id prefix. If no entry matches, validation fails and tells the user to set it explicitly. Always add `--enable-auto-tool-choice`.

---

## 5. Amazon Bedrock

### 5.1 Inference profile API and IAM actions
- **Answer:** `CreateInferenceProfile` takes `POST /inference-profiles` with `{ inferenceProfileName (1-64, ([0-9a-zA-Z][ _-]?)+), description?, clientRequestToken? (idempotency: "If this token matches a previous request, Amazon Bedrock ignores the request"), modelSource: { copyFrom: "<foundation-model ARN | system inference-profile ARN>" }, tags?: [{key, value}] (≤200) }` and returns `{ inferenceProfileArn, status: "ACTIVE" }`. Use a foundation-model ARN for a single region, or a system-defined profile ARN for cross-region.
  - The other operations are `GetInferenceProfile`, `ListInferenceProfiles` (`typeEquals=SYSTEM_DEFINED|APPLICATION`, `maxResults` ≤1000, `nextToken`; summaries include `models[].modelArn`, `type` and `status`), `DeleteInferenceProfile`, `TagResource`, `UntagResource` and `ListTagsForResource`.
  - IAM actions (service reference JSON): `bedrock:CreateInferenceProfile` (resources: application-inference-profile, foundation-model, inference-profile; conditions `aws:RequestTag/${TagKey}`, `aws:TagKeys`). `bedrock:DeleteInferenceProfile` (application-inference-profile). `bedrock:GetInferenceProfile` (application- and system profiles). `bedrock:ListInferenceProfiles` (no resource). `bedrock:TagResource`, `UntagResource` and `ListTagsForResource` (includes application-inference-profile).
  - ARN formats: `arn:aws:bedrock:${Region}:${Account}:application-inference-profile/${Id}`, `…:inference-profile/${Id}`, `arn:aws:bedrock:${Region}::foundation-model/${Id}`.
  - AWS's own example policy grants `bedrock:TagResource` alongside `CreateInferenceProfile`. Whether tag-on-create *requires* `TagResource` is not stated anywhere I found.
- **Sources:** https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateInferenceProfile.html , https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListInferenceProfiles.html , https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html , https://servicereference.us-east-1.amazonaws.com/v1/bedrock/bedrock.json , `@aws-sdk/client-bedrock` 3.1160.0 types (`InferenceProfileModelSource.copyFrom`)
- **Status:** CONFIRMED. Tag-on-create needing TagResource is UNCONFIRMED, so grant it.
- **Implication:** Name profiles `ownstack-<stack>-<alias>`. Pass `clientRequestToken` = a hash of stack, alias and modelId so retries are idempotent, and tag on create. `destroy` deletes only profiles that are in state *and* carry `ownstack:stack=<name>` (check with `ListTagsForResource`).

### 5.2 Invoke permissions through a profile
- **Answer:** There is **no separate `Converse`/`ConverseStream` IAM action**; Converse is authorized by `bedrock:InvokeModel` / `bedrock:InvokeModelWithResponseStream`. Both list `application-inference-profile`, `inference-profile` and `foundation-model` resources and the condition key `bedrock:InferenceProfileArn`. AWS: "When you specify an inference profile in the `Resource` field … you must also specify the foundation model in each Region associated with it." The Global profile example also uses the region-less `arn:aws:bedrock:::foundation-model/<id>`.
- **Sources:** https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html , service reference JSON above
- **Status:** CONFIRMED.
- **Implication:** The policy must allow `InvokeModel*` on (1) the application profile ARN, (2) the system profile ARN it copies from, when cross-region, and (3) the foundation model in every region that profile routes to, including `arn:aws:bedrock:::foundation-model/*` for global profiles. Scope (2) and (3) with `bedrock:InferenceProfileArn`.

### 5.3 On-demand vs cross-region-profile-only models
- **Answer:** `ListFoundationModels` / `GetFoundationModel` return `inferenceTypesSupported` with valid values `ON_DEMAND | PROVISIONED`. No documented value means "profile only". `ListFoundationModels` has a `byInferenceType` filter. System profiles come from `ListInferenceProfiles(typeEquals=SYSTEM_DEFINED)` and their `models[]`.
- **Sources:** https://docs.aws.amazon.com/bedrock/latest/APIReference/API_FoundationModelSummary.html , API_ListInferenceProfiles (above), SDK enum `InferenceType = {ON_DEMAND, PROVISIONED}`
- **Status:** CONFIRMED (values). The rule "ON_DEMAND absent ⇒ must use a system profile" is inferred, not stated.
- **Implication:** Preflight: if the model's summary in the region includes `ON_DEMAND`, use `copyFrom` = the foundation-model ARN. Otherwise pick the system profile whose `models[]` contains the model, with a geography prefix matching the region (us/eu/apac/global), and fail with a clear message if there is none. Also accept a user-given system profile id as `modelId`.

### 5.4 Cost Explorer: cost allocation tags
- **Answer:** Activate the tag key as a cost allocation tag in Billing → Cost allocation tags. "Tags can take up to 24 hours to appear in Cost Explorer and CUR after activation." Tags "are not retroactive". The finest grain is "per usage type per day; they do not produce per-request cost". Programmatically: `ce:UpdateCostAllocationTagsStatus` (batch ≤20, `{TagKey, Status}`) and `ce:ListCostAllocationTags`.
- **Sources:** https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html , https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_UpdateCostAllocationTagsStatus.html , service reference `ce.json`
- **Status:** CONFIRMED. Which account may activate (management or standalone) and whether a key must already be "discovered" are UNCONFIRMED.
- **Implication:** `ownstack cost` prints the CE filter `tag:ownstack:stack = <name>` and notes the activation plus the ~24 h lag. Optionally try `UpdateCostAllocationTagsStatus` and report failure as a hint, never as an error.

### 5.5 Teardown check with `tag:GetResources`
- **Answer:** Amazon Bedrock and Amazon EC2 are both listed as Resource Groups Tagging API services. Tag Editor / Resource Groups list `AWS::Bedrock::ApplicationInferenceProfile` with "Tag-based Groups: Yes" and "Tag Editor Tagging: No". The RGTA page lists them under `TagResources`/`UntagResources`; it does not specifically confirm that `GetResources` returns application inference profiles.
- **Sources:** https://docs.aws.amazon.com/resourcegroupstagging/latest/APIReference/Welcome.html , https://docs.aws.amazon.com/ARG/latest/userguide/supported-resources.html
- **Status:** UNCONFIRMED that `GetResources` returns application inference profiles. Tag-based-group support strongly suggests it does.
- **Implication:** The `down` check is `GetResources(TagFilters=[{Key:"ownstack:stack",Values:[name]}])` per region, **plus** a direct `ListInferenceProfiles(typeEquals=APPLICATION)` + `ListTagsForResource` check, so the result does not depend on RGTA. Note that RGTA can briefly return terminated resources; treat EC2 instances in the `terminated` state as gone.

---

## 6. AWS Budgets

- **Question:** Does billing data refresh "at least once a day", and does a budget action that stops an EC2 instance in an ASG get it restarted?
- **Answer:** "AWS billing data, which Budgets uses to monitor resources, is updated at least once per day." Also: "If a budget action is used to stop an Amazon EC2 instance in an Auto Scaling Group (ASG), Amazon EC2 Auto Scaling restarts the instance".
- **Source:** https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html
- **Status:** CONFIRMED (the spec cites the `.md` URL; the `.html` page carries the same text).
- **Implication:** Keep the AWS Budget as an email alert only. Note that SkyPilot clusters are not in ASGs, so the ASG caveat does not apply to OwnStack's GPUs; the daily-lag point is the real reason not to rely on Budgets.

---

## Spec changes recommended

1. **OpenCode 2 exists (GA 2.0.0 on 2026-09-11; now 2.2.3).** Change "Harness: OpenCode" so the adapter detects the major version and writes `provider`/`npm`/`options.baseURL`/`small_model` for V1, or `providers`/`package: "aisdk:@ai-sdk/openai-compatible"`/`settings.baseURL`/`agents.title.model` for V2. Record the harness major in state and in the compat matrix. (§1.1-1.2)
2. **`small_model` → `agents.title.model` in V2.** In V2 it only covers title generation; document that `smallModel` means less there. (§1.1)
3. **Key delivery on V2:** `{env:OWNSTACK_KEY}` must reach the background service. Use `opencode run --standalone` in the smoke eval and document `opencode service set env` (or `{file:}`). (§1.6)
4. **baseURL issue:** replace the AlphaNeural citation with anomalyco/opencode#5674 (closed, not reproducible) and #36834 (V2 pre-release, closed). Make the doctor check empirical: did the gateway log the smoke request? (§1.5)
5. **Security section is wrong for vLLM:** `--api-key` does not protect `/invocations` and other routes, and SkyPilot opens `ports` (and SSH) to 0.0.0.0/0 with no CIDR option. Make "no public vLLM port" the requirement: an SSH tunnel or an allowlisting reverse proxy, plus IP restriction through a user SG. Promote IP restriction from stretch goal to requirement. (§3.3, §4.1)
6. **Budget cap is not exact:** LiteLLM checks `spend >= max_budget` before each request, so the last request overshoots. Rejections are HTTP 422 by default, not 429. Update the M1 acceptance wording ("refused once spend passes it" is accurate; say the overshoot is at most one request). (§2.4)
7. **Never price an alias at explicit 0/0** in LiteLLM: that bypasses *all* budget checks for the model. An `endpoint()` with no cost should leave pricing unset; accept that its spend is "unknown", not $0. (§2.4, §2.8)
8. **Bedrock gateway entry:** use `model: bedrock/<modelId>` + `model_id: <profile ARN>` (documented), not `model: bedrock/<arn>`, so spend is priced. (§2.1)
9. **IAM must include the underlying models:** invoking through a profile needs `InvokeModel*` on the application profile, the source system profile and the foundation model in every routed region, including region-less `arn:aws:bedrock:::foundation-model/*` for global profiles. (§5.2)
10. **SkyPilot autostop cannot be the idle mechanism** (a running `vllm serve` job means the cluster is never idle). If a backstop is used, it is `wait_for: none`, a hard uptime cap. State this in the GPU section and remove "verify first". (§3.1)
11. **Teardown tag query misses `sky-sg-<cluster>`** (SkyPilot tags SGs only with `skypilot=true`). `down` should rely on `sky down` for SGs and should not expect them in the tag query. (§3.2)
12. **`skypilotGpu` needs a `toolCallParser` field** (with a default table by model family), or tool calling and the smoke eval's tool round trip fail. (§4.2)
13. **Compose:** pin `ghcr.io/berriai/litellm:v1.106.6`; do not publish Postgres; health-wait on `/health/readiness`; never call `/health` (it bills each model). (§2.6-2.7)
14. Watcher idle source: `/spend/logs/v2?model_group=<alias>&sort_by=startTime&sort_order=desc&page_size=1`, with about 10 s of write lag (`PROXY_BATCH_WRITE_AT`). (§2.9)

---

## Minimal IAM policy sketch (confirmed actions only)

Replace `<ACCT>` and `<REGION>`. The SkyPilot statements copy SkyPilot's documented minimal policy plus its optional "open ports" and "tag volumes" rules. Drop the ports rules if vLLM is reached only through an SSH tunnel. Bedrock invoke resources are wildcards here; `policies/` should narrow them at `up` time to the exact profile, system-profile and foundation-model ARNs (§5.2). Grant `ce:UpdateCostAllocationTagsStatus` only if OwnStack activates the tag itself.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "BedrockDiscover",
      "Effect": "Allow",
      "Action": ["bedrock:ListFoundationModels", "bedrock:GetFoundationModel", "bedrock:ListInferenceProfiles"],
      "Resource": "*" },
    { "Sid": "BedrockProfileCreate",
      "Effect": "Allow",
      "Action": ["bedrock:CreateInferenceProfile"],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:*:<ACCT>:inference-profile/*",
        "arn:aws:bedrock:*:<ACCT>:application-inference-profile/*"
      ],
      "Condition": { "ForAllValues:StringLike": { "aws:TagKeys": ["ownstack:*"] } } },
    { "Sid": "BedrockProfileManage",
      "Effect": "Allow",
      "Action": ["bedrock:GetInferenceProfile", "bedrock:DeleteInferenceProfile",
                 "bedrock:TagResource", "bedrock:UntagResource", "bedrock:ListTagsForResource"],
      "Resource": "arn:aws:bedrock:*:<ACCT>:application-inference-profile/*" },
    { "Sid": "BedrockGetSystemProfiles",
      "Effect": "Allow",
      "Action": ["bedrock:GetInferenceProfile"],
      "Resource": "arn:aws:bedrock:*:<ACCT>:inference-profile/*" },
    { "Sid": "BedrockInvokeViaProfile",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": [
        "arn:aws:bedrock:*:<ACCT>:application-inference-profile/*",
        "arn:aws:bedrock:*:<ACCT>:inference-profile/*",
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:::foundation-model/*"
      ] },
    { "Sid": "TeardownTagQuery",
      "Effect": "Allow",
      "Action": ["tag:GetResources"],
      "Resource": "*" },
    { "Sid": "CostView",
      "Effect": "Allow",
      "Action": ["ce:GetCostAndUsage", "ce:ListCostAllocationTags"],
      "Resource": "*" },

    { "Sid": "SkyRunFromAmi", "Effect": "Allow", "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*::image/ami-*" },
    { "Sid": "SkyRun", "Effect": "Allow", "Action": "ec2:RunInstances",
      "Resource": [
        "arn:aws:ec2:*:<ACCT>:instance/*", "arn:aws:ec2:*:<ACCT>:network-interface/*",
        "arn:aws:ec2:*:<ACCT>:subnet/*", "arn:aws:ec2:*:<ACCT>:volume/*",
        "arn:aws:ec2:*:<ACCT>:security-group/*" ] },
    { "Sid": "SkyLifecycle", "Effect": "Allow",
      "Action": ["ec2:TerminateInstances", "ec2:DeleteTags", "ec2:StartInstances", "ec2:CreateTags", "ec2:StopInstances"],
      "Resource": "arn:aws:ec2:*:<ACCT>:instance/*" },
    { "Sid": "SkyTagVolumes", "Effect": "Allow", "Action": ["ec2:CreateTags"],
      "Resource": "arn:aws:ec2:*:<ACCT>:volume/*" },
    { "Sid": "SkyDescribe", "Effect": "Allow", "Action": ["ec2:Describe*"], "Resource": "*" },
    { "Sid": "SkySecurityGroups", "Effect": "Allow",
      "Action": ["ec2:CreateSecurityGroup", "ec2:AuthorizeSecurityGroupIngress"],
      "Resource": "arn:aws:ec2:*:<ACCT>:*" },
    { "Sid": "SkyOpenPortsOptional", "Effect": "Allow",
      "Action": ["ec2:DeleteSecurityGroup", "ec2:ModifyInstanceAttribute"],
      "Resource": "arn:aws:ec2:*:<ACCT>:*" },
    { "Sid": "SkySpotSLR", "Effect": "Allow", "Action": "iam:CreateServiceLinkedRole", "Resource": "*",
      "Condition": { "StringEquals": { "iam:AWSServiceName": "spot.amazonaws.com" } } },
    { "Sid": "SkyRole", "Effect": "Allow", "Action": ["iam:GetRole", "iam:PassRole"],
      "Resource": "arn:aws:iam::<ACCT>:role/skypilot-v1" },
    { "Sid": "SkyInstanceProfile", "Effect": "Allow", "Action": ["iam:GetInstanceProfile"],
      "Resource": "arn:aws:iam::<ACCT>:instance-profile/skypilot-v1" }
  ]
}
```

Notes on the sketch:
- The `aws:TagKeys` condition on `CreateInferenceProfile` is documented as a supported condition key; that it works for this purpose is untested.
- SkyPilot's minimal policy assumes the `skypilot-v1` role already exists. Without it, add `iam:CreateRole`, `iam:AttachRolePolicy`, `iam:CreateInstanceProfile` and `iam:AddRoleToInstanceProfile` on those same ARNs, per SkyPilot's optional rule.
- Source: https://docs.skypilot.ai/en/latest/cloud-setup/cloud-permissions/aws.html

## Decision: GPU access via SSH tunnel (2026-10-31)

Alec chose to keep the vLLM port private: SkyPilot task YAML declares no public `ports`, and the gateway reaches vLLM through an SSH tunnel to the cluster (SkyPilot-managed keys). This replaces the spec's "open only the vLLM port, protected by an API key". The vLLM API key is still set as defense in depth. Implementation details (tunnel lifecycle, how the LiteLLM container reaches the tunnel, re-establishing after restarts) are worked out in M2.
