import { join, resolve } from "node:path";

export const STATE_DIR_NAME = ".ownstack";

export interface StatePaths {
  root: string;
  stateFile: string;
  secretsFile: string;
  gatewayDir: string;
  backupsDir: string;
  backupsManifest: string;
}

export function statePaths(cwd: string): StatePaths {
  const root = join(resolve(cwd), STATE_DIR_NAME);
  return {
    root,
    stateFile: join(root, "state.json"),
    secretsFile: join(root, "secrets.env"),
    gatewayDir: join(root, "gateway"),
    backupsDir: join(root, "backups"),
    backupsManifest: join(root, "backups", "manifest.json"),
  };
}
