// Shared contracts between the CLI and every pluggable layer.
// The CLI only ever talks to these interfaces; backend- and harness-specific
// logic lives behind them (see SPEC.md, "Components").

import type { StackConfig } from "../config/schema.js";

export type BackendKind = "bedrock" | "skypilotGpu" | "endpoint";

/** Everything a command needs to act on one stack. */
export interface Ctx {
  /** Directory containing ownstack.config.ts. */
  cwd: string;
  /** Absolute path of the .ownstack/ directory. */
  stateDir: string;
  config: StackConfig;
  /** Alias currently being acted on, when the call is per-model. */
  alias?: string;
  log: Logger;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
  debug(msg: string): void;
}

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
  /** How to fix a failing check. */
  hint?: string;
}

export type PlanAction = "create" | "update" | "destroy" | "noop";

export interface PlanStep {
  action: PlanAction;
  alias: string;
  backend: BackendKind;
  summary: string;
  /** Estimated $/hr for resources billed by the hour (GPUs). */
  estHourlyUsd?: number;
}

/** One created resource, as recorded in .ownstack/state.json. */
export interface ResourceState {
  kind: string;
  id: string;
  alias: string;
  backend: BackendKind;
  region?: string;
  createdAt: string;
  tags: Record<string, string>;
  /** Backend-specific, non-secret data needed to rebuild a gateway entry or destroy the resource. */
  data?: Record<string, unknown>;
}

export type BackendState = "running" | "stopped" | "failed" | "unknown";

export interface BackendStatus {
  state: BackendState;
  detail?: string;
  uptimeSeconds?: number;
}

/** One LiteLLM model_list item. Secrets are referenced as os.environ/NAME, never inlined. */
export interface GatewayModelEntry {
  model_name: string;
  litellm_params: Record<string, unknown>;
  model_info?: Record<string, unknown>;
}

export interface GatewayInfo {
  baseUrl: string;
  /** Name of the env var holding the stack's virtual key. */
  keyEnv: string;
}

/** Harness role (e.g. "model", "smallModel") to gateway alias. */
export type AliasMap = Record<string, string>;

export interface FileChange {
  path: string;
  action: "created" | "updated" | "unchanged";
  backupPath?: string;
}

export interface SmokeResult {
  ok: boolean;
  checks: Check[];
}

export interface Backend {
  kind: BackendKind;
  preflight(ctx: Ctx): Promise<Check[]>;
  plan(ctx: Ctx, current?: ResourceState): Promise<PlanStep[]>;
  provision(ctx: Ctx): Promise<ResourceState>; // idempotent
  destroy(ctx: Ctx, state: ResourceState): Promise<void>;
  gatewayEntry(state: ResourceState): GatewayModelEntry; // becomes a LiteLLM model_list item
  status(ctx: Ctx, state: ResourceState): Promise<BackendStatus>;
  hourlyCostUsd?(state: ResourceState): number | undefined;
}

export interface HarnessAdapter {
  name: "opencode";
  writeConfig(ctx: Ctx, gateway: GatewayInfo, aliases: AliasMap): Promise<FileChange[]>;
  restoreConfig(ctx: Ctx): Promise<void>;
  smokeTest?(ctx: Ctx): Promise<SmokeResult>;
}

export const STACK_TAG_KEY = "ownstack:stack";
