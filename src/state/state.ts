import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ResourceState } from "../core/types.js";
import { isNotFound, writeFileAtomic } from "../util/fs.js";
import { withLock } from "../util/lock.js";
import { VERSION } from "../version.js";
import { statePaths } from "./paths.js";

const resourceStateSchema = z.strictObject({
  kind: z.string().min(1),
  id: z.string().min(1),
  alias: z.string().min(1),
  backend: z.enum(["bedrock", "skypilotGpu", "endpoint"]),
  region: z.string().optional(),
  createdAt: z.string().min(1),
  tags: z.record(z.string(), z.string()),
  data: z.record(z.string(), z.unknown()).optional(),
});

const stackStateSchema = z.strictObject({
  stackName: z.string(),
  ownstackVersion: z.string(),
  resources: z.array(resourceStateSchema),
});

export interface StackState {
  stackName: string;
  ownstackVersion: string;
  resources: ResourceState[];
}

export class StateError extends Error {
  override name = "StateError";
}

export function emptyState(stackName: string): StackState {
  return { stackName, ownstackVersion: VERSION, resources: [] };
}

/** Load .ownstack/state.json; a missing file yields an empty state for `stackName`. */
export async function loadState(cwd: string, stackName: string): Promise<StackState> {
  const file = statePaths(cwd).stateFile;
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if (isNotFound(err)) return emptyState(stackName);
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new StateError(`${file} is not valid JSON. Restore it from a backup or remove it only if no resources exist.`);
  }
  const parsed = stackStateSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new StateError(`${file} is corrupted:\n${issues}`);
  }
  const state = parsed.data as StackState;
  assertStackName(state, stackName);
  return state;
}

/** Refuse to act on a state file that belongs to a different stack. */
export function assertStackName(state: StackState, configName: string): void {
  if (state.stackName !== configName) {
    throw new StateError(
      `State in .ownstack/ belongs to stack "${state.stackName}" but the config is named "${configName}". ` +
        `Rename the config back, or run "ownstack down" with the old name first.`,
    );
  }
}

export async function saveState(cwd: string, state: StackState): Promise<void> {
  const next: StackState = { ...state, ownstackVersion: VERSION };
  await writeFileAtomic(statePaths(cwd).stateFile, JSON.stringify(next, null, 2) + "\n");
}

/** Record a resource immediately; replaces any existing entry with the same kind and id. */
export async function addResource(cwd: string, stackName: string, resource: ResourceState): Promise<StackState> {
  return withLock(statePaths(cwd).stateFile, async () => {
    const state = await loadState(cwd, stackName);
    const resources = state.resources.filter((r) => !(r.kind === resource.kind && r.id === resource.id));
    const next = { ...state, resources: [...resources, resource] };
    await saveState(cwd, next);
    return next;
  });
}

export async function removeResource(
  cwd: string,
  stackName: string,
  match: Pick<ResourceState, "kind" | "id">,
): Promise<StackState> {
  return withLock(statePaths(cwd).stateFile, async () => {
    const state = await loadState(cwd, stackName);
    const next = {
      ...state,
      resources: state.resources.filter((r) => !(r.kind === match.kind && r.id === match.id)),
    };
    await saveState(cwd, next);
    return next;
  });
}

export function findByAlias(state: StackState, alias: string): ResourceState[] {
  return state.resources.filter((r) => r.alias === alias);
}
