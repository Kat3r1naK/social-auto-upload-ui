import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const electron = require('electron') as string
const result = spawnSync(
  electron,
  [
    '-e',
    'const {DatabaseSync}=require("node:sqlite"); console.log(JSON.stringify({electron:process.versions.electron,node:process.versions.node,sqlite:new DatabaseSync(":memory:").prepare("SELECT sqlite_version() AS version").get().version}))',
  ],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  },
)
assert.equal(result.status, 0, result.stderr || String(result.error))
const versions = JSON.parse(result.stdout.trim()) as { sqlite?: string }
assert.ok(versions.sqlite)
console.log(result.stdout.trim())
