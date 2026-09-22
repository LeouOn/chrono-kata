import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'src', 'app', 'api');
const stashDir = path.join(root, 'src', 'app', '_api');

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function runNextBuild() {
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      NEXT_EXPORT: 'true',
    },
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next build exited with code ${code ?? 'null'}`));
    });
  });
}

let stashed = false;

async function restoreApi() {
  if (!stashed) return;
  if (await exists(apiDir)) {
    throw new Error('src/app/api reappeared while src/app/_api was stashed; refusing to overwrite it');
  }
  await rename(stashDir, apiDir);
  stashed = false;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restoreApi()
      .catch((error) => {
        console.error(error);
      })
      .finally(() => process.exit(1));
  });
}

let buildError = null;
let restoreError = null;

try {
  if (await exists(stashDir)) {
    throw new Error('src/app/_api already exists. Move it back to src/app/api before building for Android.');
  }
  if (!(await exists(apiDir))) {
    throw new Error('src/app/api is missing, so the Android export cannot stash the desktop API route.');
  }
  await rename(apiDir, stashDir);
  stashed = true;
  await runNextBuild();
} catch (error) {
  buildError = error;
} finally {
  try {
    await restoreApi();
  } catch (error) {
    restoreError = error;
  }
}

if (restoreError) {
  console.error('Failed to restore src/app/api:', restoreError);
}
if (buildError) {
  console.error(buildError);
}
if (buildError || restoreError) {
  process.exitCode = 1;
}
