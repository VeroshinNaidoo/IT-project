// @ts-nocheck - cross-platform command runner used by the backup integration test.
import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${command} ${args.join(' ')} exited with code ${code}`),
        );
    });
  });
}

const node = process.execPath;
try {
  await run(node, ['scripts/pglite-server.mjs', 'start-role', 'test']);
  await run(node, ['backend/scripts/reset-test-db.js']);
  await run(node, ['scripts/test-backup-restore.mjs']);
} finally {
  await run(node, ['scripts/pglite-server.mjs', 'stop-role', 'test']).catch(
    (error) => console.error(`Test database cleanup failed: ${error.message}`),
  );
}
