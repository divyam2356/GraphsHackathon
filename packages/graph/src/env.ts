// Zero-dep .env loader (dotenv pattern): `import "@blackbox/graph/src/env"`.
// Walks up from cwd to find .env, sets missing vars only — explicit env wins.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
export function loadEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const f = join(dir, ".env");
    if (existsSync(f)) {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
      }
      return;
    }
    const up = dirname(dir);
    if (up === dir) return;
    dir = up;
  }
}
loadEnv();
