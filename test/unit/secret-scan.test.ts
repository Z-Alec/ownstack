import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KEY_PATTERNS } from "../../src/util/redact.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Directories whose contents are committed or published and must never hold key material. */
const SCAN_ROOTS = ["templates", "examples", "test/fixtures", "test"];
const MAX_BYTES = 2 * 1024 * 1024;

async function* walk(dir: string, filter: (p: string) => boolean): AsyncGenerator<string> {
  if (!existsSync(dir)) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p, filter);
    else if (entry.isFile() && filter(p)) yield p;
  }
}

/** Snapshots anywhere under test/, everything under the other roots. */
function inScope(root: string) {
  return (p: string) => (root === "test" ? p.split(/[\\/]/).includes("__snapshots__") : true);
}

export function findKeys(text: string): string[] {
  const hits: string[] = [];
  for (const { name, regex, accept } of KEY_PATTERNS) {
    for (const m of text.matchAll(new RegExp(regex.source, regex.flags))) {
      if (!accept || accept(m[0])) hits.push(`${name}: ${m[0].slice(0, 12)}…`);
    }
  }
  return hits;
}

async function scanFiles(files: string[]): Promise<string[]> {
  const findings: string[] = [];
  for (const f of files) {
    if ((await stat(f)).size > MAX_BYTES) continue;
    for (const hit of findKeys(await readFile(f, "utf8"))) findings.push(`${relative(ROOT, f)} -> ${hit}`);
  }
  return findings;
}

describe("secret scan", () => {
  it("detects every key shape it is meant to catch", () => {
    const samples = [
      ["sk-", "ownstack-", "A1b2C3d4E5f6G7h8I9j0K1l2"],
      ["AKIA", "ABCDEFGHIJKLMNOP"],
      ["wJalrXUtnFEMI/K7MDENG/", "bPxRfiCYEXAMPLEKEY"],
      ["Authorization: Bearer ", "abcdefghijklmnop"],
      ["-----BEGIN ", "OPENSSH PRIVATE KEY-----"],
    ].map((parts) => parts.join(""));
    for (const s of samples) expect(findKeys(s), s.slice(0, 8)).not.toHaveLength(0);
  });

  it("finds no key material in templates, examples, fixtures, snapshots or rendered gateway files", async () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) {
      for await (const f of walk(join(ROOT, root), inScope(root))) files.push(f);
    }
    // Rendered gateway output, once a stack has been brought up in this checkout.
    for await (const f of walk(join(ROOT, ".ownstack", "gateway"), () => true)) files.push(f);

    expect(await scanFiles([...new Set(files)])).toEqual([]);
  });
});
