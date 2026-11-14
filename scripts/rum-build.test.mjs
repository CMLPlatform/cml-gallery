import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'node_modules/astro/bin/astro.mjs');

test('built pages omit RUM by default, include the proxy when enabled, and reject unsafe endpoints', () => {
  const output = mkdtempSync(join(tmpdir(), 'gallery-rum-build-'));
  try {
    for (const endpoint of ['', 'https://rum.example.org', 'http://rum.example.org', 'https://token@rum.example.org', 'https://rum.example.org?token=secret', 'https://rum.example.org#secret']) {
      const result = spawnSync(process.execPath, [cli, 'build', '--outDir', output], {
        cwd: root,
        env: { ...process.env, PUBLIC_RUM_ENDPOINT: endpoint, ASTRO_TELEMETRY_DISABLED: '1' },
        encoding: 'utf8',
      });
      if (endpoint && endpoint !== 'https://rum.example.org') {
        assert.notEqual(result.status, 0, 'unsafe endpoint must fail the build');
        assert.match(result.stdout + result.stderr, /PUBLIC_RUM_ENDPOINT must be an HTTPS proxy URL/);
        continue;
      }
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const html = readFileSync(join(output, 'index.html'), 'utf8');
      if (endpoint) {
        assert.match(html, /data-endpoint="https:\/\/rum\.example\.org"/);
        assert.match(html, /WebVital: LCP/);
        assert.doesNotMatch(html, /__OTEL_TOKEN__|Authorization/);
      } else {
        assert.doesNotMatch(html, /data-endpoint=|WebVital: LCP/);
      }
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
