import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Write via a temp file in the same directory, then rename over the target. */
export async function writeFileAtomic(path: string, data: string, mode?: number): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, data, mode === undefined ? undefined : { mode });
    if (mode !== undefined) await chmod(tmp, mode);
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  if (mode !== undefined) await chmod(path, mode);
}

export function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}
