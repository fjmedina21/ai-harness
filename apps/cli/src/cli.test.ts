import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { main } from './index.js';

test('CLI can initialize and validate a project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'harness-cli-'));
  const lines: string[] = [];
  try {
    assert.equal(await main(['init', '--path', root, '--name', 'cli-demo'], root, line => lines.push(line)), 0);
    assert.equal(await main(['doctor', '--path', root], root, line => lines.push(line)), 0);
    assert.ok(lines.some(line => line.includes('OK: cli-demo')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('CLI help and version have no external dependencies', async () => {
  const lines: string[] = [];
  assert.equal(await main(['--help'], process.cwd(), line => lines.push(line)), 0);
  assert.match(lines[0]!, /Phase 0/);
});
