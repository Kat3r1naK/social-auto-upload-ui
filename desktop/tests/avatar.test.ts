import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { StudioService } from '../service'
import { StudioStore } from '../store'
import type { WorkerResult } from '../worker'

test('account avatars survive edits/restart, refresh by content, and never fail account validation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'sau-avatar-test-'))
  const store = new StudioStore(directory)
  let result: WorkerResult = { ok: true, message: 'connected' }
  const service = new StudioService(
    store,
    { ready: true, message: '', command: '', prefix: [] },
    'test',
    () => {},
    () => ({ result: Promise.resolve(result), stop: async () => {} }),
  )
  const { createHash } = await import('node:crypto')
  // Solid 128px blue/red PNGs generated with Pillow, with no private account data.
  const first = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAA7UlEQVR42u3SAQ0AAAjDsIN/z2CDhFbCskpmwlstgQEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYwAASGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwADcsF4HAv5ZDfIpAAAAAElFTkSuQmCC',
    'base64',
  )
  try {
    const account = service.saveAccount({ platformId: 'xiaohongshu', name: '别名', group: '分组' })
    const id = String(account.id)
    result = { ok: true, message: 'connected', avatar: first.toString('base64') }
    await service.accountAction(id, 'login')
    const path = join(directory, 'avatars', id + '.png')
    const url = store.account(id)?.avatarUrl
    assert.equal(store.account(id)?.status, 'valid')
    assert.equal(store.account(id)?.name, '别名')
    assert.equal(
      url,
      'sau-media://avatar/' +
        id +
        '?v=' +
        createHash('sha256').update(first).digest('hex').slice(0, 16),
    )
    assert.deepEqual(readFileSync(path), first)
    assert.equal(JSON.stringify(service.snapshot()).includes(first.toString('base64')), false)
    service.saveAccount({ id, platformId: 'xiaohongshu', name: '改过的别名', group: '分组' })
    assert.equal(store.account(id)?.avatarUrl, url)
    for (const avatar of [
      undefined,
      'invalid image',
      Buffer.from('<svg/>').toString('base64'),
      'a'.repeat(100_001),
    ]) {
      result = { ok: true, message: 'checked', avatar }
      await service.accountAction(id, 'check')
      assert.equal(store.account(id)?.status, 'valid')
      assert.equal(store.account(id)?.avatarUrl, url)
      assert.deepEqual(readFileSync(path), first)
    }
    const second = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAA7UlEQVR42u3SAQ0AAAjDsIN/z2CDhFbCsppkwlstgQEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYwAASGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwADcsGAFAv4+s2wAAAAAAElFTkSuQmCC',
      'base64',
    )
    result = { ok: false, message: 'expired', avatar: second.toString('base64') }
    await service.accountAction(id, 'check')
    assert.equal(store.account(id)?.status, 'expired')
    assert.equal(store.account(id)?.avatarUrl, url)
    result = { ...result, ok: true }
    await service.accountAction(id, 'check')
    assert.notEqual(store.account(id)?.avatarUrl, url)
    assert.deepEqual(readFileSync(path), second)
    const reopened = new StudioStore(directory)
    try {
      assert.equal(reopened.account(id)?.avatarUrl, store.account(id)?.avatarUrl)
    } finally {
      reopened.close()
    }
    service.removeAccount(id)
    assert.equal(existsSync(path), false)
  } finally {
    await service.stop()
    store.close()
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'sau-avatar-test-'))
    rmSync(directory, { recursive: true, force: true })
  }
})
