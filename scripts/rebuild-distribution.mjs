#!/usr/bin/env node

/**
 * Rebuild the complete APM-ALDC Copilot distribution from canonical source.
 *
 * ALDC_CANONICAL selects the clean canonical checkout consumed by
 * build-apm.mjs. APM_BIN may point to a specific APM CLI executable; otherwise
 * `apm` is resolved from PATH.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SCRIPT_DIR, '..');
const APM_BIN = process.env.APM_BIN || (process.platform === 'win32' ? 'apm.exe' : 'apm');

execFileSync(process.execPath, [join(SCRIPT_DIR, 'build-apm.mjs')], {
  cwd: REPO,
  env: process.env,
  stdio: 'inherit',
});

execFileSync(APM_BIN, ['install', '--target', 'copilot'], {
  cwd: REPO,
  env: process.env,
  stdio: 'inherit',
});

// APM records wall-clock install time in apm.lock.yaml. That metadata is not a
// package input and would make two otherwise identical rebuilds differ. Pin it
// to the immutable canonical commit timestamp already recorded by build-apm.
const provenance = JSON.parse(readFileSync(join(SCRIPT_DIR, 'build-apm.lock.json'), 'utf8'));
const apmLockPath = join(REPO, 'apm.lock.yaml');
let apmLock = readFileSync(apmLockPath, 'utf8');
if (!/^generated_at:\s*.+$/m.test(apmLock)) {
  throw new Error('apm.lock.yaml has no generated_at field to normalize');
}
apmLock = apmLock.replace(
  /^generated_at:\s*.+$/m,
  `generated_at: '${provenance.generatedAt}'`,
);
writeFileSync(apmLockPath, apmLock);

console.log(`Distribution rebuilt from ${provenance.canonicalRef}`);
console.log(`apm.lock.yaml timestamp pinned to ${provenance.generatedAt}`);
