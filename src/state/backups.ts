import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { isNotFound, writeFileAtomic } from "../util/fs.js";
import { withLock } from "../util/lock.js";
import { statePaths } from "./paths.js";

const manifestSchema = z.strictObject({
  entries: z.array(
    z.strictObject({
      original: z.string(),
      /** File name inside backups/, or null if the original did not exist. */
      backup: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
type Manifest = z.infer<typeof manifestSchema>;

async function readManifest(file: string): Promise<Manifest> {
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    if (!parsed.success) throw new Error(`${file} is corrupted; inspect it before restoring.`);
    return parsed.data;
  } catch (err) {
    if (isNotFound(err)) return { entries: [] };
    throw err;
  }
}

async function writeManifest(file: string, manifest: Manifest): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(manifest, null, 2) + "\n");
}

/**
 * Back up `path` before OwnStack first modifies it. An existing backup is kept,
 * so repeated runs never replace the user's original. Returns the backup path,
 * or undefined if the file did not exist (restore will then delete it).
 */
export async function backupFile(cwd: string, path: string): Promise<string | undefined> {
  const paths = statePaths(cwd);
  const original = resolve(cwd, path);
  return withLock(paths.backupsManifest, async () => {
    const manifest = await readManifest(paths.backupsManifest);
    const existing = manifest.entries.find((e) => e.original === original);
    if (existing) return existing.backup ? join(paths.backupsDir, existing.backup) : undefined;

    const hash = createHash("sha256").update(original).digest("hex").slice(0, 12);
    let backup: string | null = `${basename(original)}.${hash}.bak`;
    await mkdir(paths.backupsDir, { recursive: true });
    try {
      await copyFile(original, join(paths.backupsDir, backup));
    } catch (err) {
      if (!isNotFound(err)) throw err;
      backup = null;
    }
    manifest.entries.push({ original, backup, createdAt: new Date().toISOString() });
    await writeManifest(paths.backupsManifest, manifest);
    return backup ? join(paths.backupsDir, backup) : undefined;
  });
}

/** Put `path` back as it was before backupFile. Returns false if no backup was recorded. */
export async function restoreFile(cwd: string, path: string): Promise<boolean> {
  const paths = statePaths(cwd);
  const original = resolve(cwd, path);
  return withLock(paths.backupsManifest, async () => {
    const manifest = await readManifest(paths.backupsManifest);
    const entry = manifest.entries.find((e) => e.original === original);
    if (!entry) return false;
    if (entry.backup) {
      const src = join(paths.backupsDir, entry.backup);
      await copyFile(src, original);
      await rm(src, { force: true });
    } else {
      await rm(original, { force: true });
    }
    manifest.entries = manifest.entries.filter((e) => e !== entry);
    await writeManifest(paths.backupsManifest, manifest);
    return true;
  });
}
