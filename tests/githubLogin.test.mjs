import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: [resolve('src/lib/githubLogin.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const bundlePath = resolve('node_modules/.github-login-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const githubLogin = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

test('GitHub login starts at the Spring Security authorization path', () => {
  assert.equal(githubLogin.GITHUB_LOGIN_PATH, '/oauth2/authorization/github')
})

test('a refused GitHub login shows one message, other errors show nothing', () => {
  assert.match(githubLogin.githubLoginError('?error=github'), /Logssey GitHub 조직원만/)
  assert.equal(githubLogin.githubLoginError(''), null)
  assert.equal(githubLogin.githubLoginError('?error=other'), null)
  assert.equal(githubLogin.githubLoginError('?from=%2Freach'), null)
})

test('the button appears only when the server says github is true', () => {
  assert.equal(githubLogin.isGithubLoginAvailable({ github: true }), true)
  assert.equal(githubLogin.isGithubLoginAvailable({ github: false }), false)
  assert.equal(githubLogin.isGithubLoginAvailable({ github: 'true' }), false)
  assert.equal(githubLogin.isGithubLoginAvailable(null), false)
  assert.equal(githubLogin.isGithubLoginAvailable(undefined), false)
})
