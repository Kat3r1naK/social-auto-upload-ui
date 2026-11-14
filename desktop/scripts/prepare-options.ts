import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { platforms } from '../../shared/platforms'
import { resolveRuntime, startWorker } from '../worker'
import type { PlatformOption } from '../../shared/desktop'

export async function prepareOptions(root: string) {
  const runtime = resolveRuntime(root)
  const directory = mkdtempSync(join(tmpdir(), 'sau-options-build-'))
  const options: Record<string, PlatformOption[]> = {}
  try {
    for (const platform of platforms)
      for (const kind of platform.kinds) {
        const result = await startWorker(
          runtime,
          directory,
          { platform: platform.id, action: 'schema', kind },
          () => {},
        ).result
        if (!result.ok || !result.options)
          throw new Error(platform.id + '/' + kind + ': ' + result.message)
        options[platform.id + ':' + kind] = result.options
      }
    writeFileSync(
      join(root, 'desktop/runtime/worker/platform-options.json'),
      JSON.stringify(
        {
          workerHash: createHash('sha256').update(readFileSync(runtime.command)).digest('hex'),
          options,
        },
        null,
        2,
      ),
    )
    console.log(
      'Prepared ' +
        Object.keys(options).length +
        ' platform/content schemas without runtime Python startup.',
    )
  } finally {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'sau-options-build-'))
      throw new Error('Unexpected build path')
    rmSync(directory, { recursive: true, force: true })
  }
}
if (require.main === module)
  void prepareOptions(resolve(__dirname, '../../..')).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
