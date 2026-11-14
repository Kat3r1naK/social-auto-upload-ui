import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { platforms } from '../../shared/platforms'
import { resolveRuntime, startWorker } from '../worker'

test('every supported platform/content pair loads an actual worker schema without platform operations', async () => {
  const runtime = resolveRuntime(process.cwd())
  assert.equal(runtime.ready, true, 'Run uv sync --python 3.12 --extra desktop first')
  const directory = mkdtempSync(join(tmpdir(), 'sau-worker-test-'))
  try {
    for (const platform of platforms)
      for (const kind of platform.kinds) {
        const result = await startWorker(
          runtime,
          directory,
          { platform: platform.id, action: 'schema', kind },
          () => {},
        ).result
        assert.equal(result.ok, true, platform.id + '/' + kind + ': ' + result.message)
        assert.ok(Array.isArray(result.options))
      }
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'sau-worker-test-'))
    rmSync(directory, { recursive: true, force: true })
  }
})
