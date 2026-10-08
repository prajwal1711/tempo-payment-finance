import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const local = resolve('.tooling/forge');
const result = spawnSync(existsSync(local) ? local : 'forge', process.argv.slice(2), {
  cwd: resolve('contracts'), stdio: 'inherit', env: process.env,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
