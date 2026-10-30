import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { ResourceState } from "../../../src/core/types.js";
import { statePaths } from "../../../src/state/paths.js";
import {
  addResource,
  findByAlias,
  loadState,
  removeResource,
  saveState,
  StateError,
} from "../../../src/state/state.js";
import { VERSION } from "../../../src/version.js";
import { useTempDir } from "./helpers.js";

const tempDir = useTempDir();

function resource(id: string, alias = "primary"): ResourceState {
  return {
    kind: "bedrock-inference-profile",
    id,
    alias,
    backend: "bedrock",
    region: "us-east-1",
    createdAt: "2026-10-30T00:00:00.000Z",
    tags: { "ownstack:stack": "demo" },
    data: { arn: `arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/${id}` },
  };
}

describe("state", () => {
  it("returns an empty state when the file is missing", async () => {
    const cwd = await tempDir();
    expect(await loadState(cwd, "demo")).toEqual({ stackName: "demo", ownstackVersion: VERSION, resources: [] });
  });

  it("round-trips resources and writes each one immediately", async () => {
    const cwd = await tempDir();
    await addResource(cwd, "demo", resource("a"));
    const onDisk = JSON.parse(await readFile(statePaths(cwd).stateFile, "utf8"));
    expect(onDisk.resources).toHaveLength(1);

    await addResource(cwd, "demo", resource("b", "bulk"));
    await addResource(cwd, "demo", resource("a")); // replace, not duplicate
    const state = await loadState(cwd, "demo");
    expect(state.resources.map((r) => r.id)).toEqual(["b", "a"]);
    expect(findByAlias(state, "bulk")).toEqual([resource("b", "bulk")]);

    await removeResource(cwd, "demo", { kind: "bedrock-inference-profile", id: "b" });
    expect((await loadState(cwd, "demo")).resources.map((r) => r.id)).toEqual(["a"]);
  });

  it("serializes concurrent addResource calls without losing writes", async () => {
    const cwd = await tempDir();
    await Promise.all(["a", "b", "c", "d", "e"].map((id) => addResource(cwd, "demo", resource(id))));
    expect((await loadState(cwd, "demo")).resources).toHaveLength(5);
  });

  it("writes atomically, leaving no temp files behind", async () => {
    const cwd = await tempDir();
    await saveState(cwd, { stackName: "demo", ownstackVersion: "0.0.0", resources: [resource("a")] });
    expect(await readdir(statePaths(cwd).root)).toEqual(["state.json"]);
    expect((await loadState(cwd, "demo")).ownstackVersion).toBe(VERSION);
  });

  it("rejects invalid JSON with a clear error", async () => {
    const cwd = await tempDir();
    await mkdir(statePaths(cwd).root, { recursive: true });
    await writeFile(statePaths(cwd).stateFile, "{ not json");
    await expect(loadState(cwd, "demo")).rejects.toThrow(/state\.json is not valid JSON/);
  });

  it("rejects a structurally corrupted state, naming the bad field", async () => {
    const cwd = await tempDir();
    await mkdir(statePaths(cwd).root, { recursive: true });
    await writeFile(
      statePaths(cwd).stateFile,
      JSON.stringify({ stackName: "demo", ownstackVersion: "0.0.1", resources: [{ id: "x" }] }),
    );
    const err = await loadState(cwd, "demo").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StateError);
    expect((err as Error).message).toMatch(/corrupted/);
    expect((err as Error).message).toMatch(/resources\.0\.kind/);
  });

  it("refuses a state that belongs to another stack", async () => {
    const cwd = await tempDir();
    await addResource(cwd, "demo", resource("a"));
    await expect(loadState(cwd, "other")).rejects.toThrow(/belongs to stack "demo".*"other"/);
    await expect(addResource(cwd, "other", resource("b"))).rejects.toThrow(StateError);
  });
});
