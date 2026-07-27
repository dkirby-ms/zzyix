import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const PLAYWRIGHT_CACHE_DIR = path.join(homedir(), '.cache', 'ms-playwright')

const resolveBrowserExecutable = () => {
  if (!existsSync(PLAYWRIGHT_CACHE_DIR)) {
    return null
  }

  const installDirs = readdirSync(PLAYWRIGHT_CACHE_DIR)
    .filter((entry) => entry.startsWith('chromium_headless_shell-') || entry.startsWith('chromium-'))
    .sort()
    .reverse()

  for (const installDir of installDirs) {
    const candidates = [
      path.join(PLAYWRIGHT_CACHE_DIR, installDir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      path.join(PLAYWRIGHT_CACHE_DIR, installDir, 'chrome-linux', 'chrome'),
    ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}

const readMissingLibraries = (browserExecutable) => {
  const ldd = spawnSync('ldd', [browserExecutable], { encoding: 'utf8' })

  if (ldd.error) {
    throw ldd.error
  }

  const output = `${ldd.stdout}\n${ldd.stderr}`
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('=> not found'))
    .map((line) => line.split('=>')[0]?.trim())
    .filter((line) => Boolean(line))
}

if (process.platform !== 'linux') {
  process.exit(0)
}

const browserExecutable = resolveBrowserExecutable()
if (!browserExecutable) {
  process.exit(0)
}

const missingLibraries = readMissingLibraries(browserExecutable)
if (missingLibraries.length === 0) {
  process.exit(0)
}

console.error('Playwright Chromium is installed but cannot start on this Linux host.')
console.error(`Browser binary: ${browserExecutable}`)
console.error('Missing shared libraries:')
for (const library of missingLibraries) {
  console.error(`- ${library}`)
}
console.error('')
console.error('Install the missing system packages, then re-run the e2e suite.')
console.error('If you have sudo access, the usual fix is:')
console.error('  sudo npx playwright install-deps chromium')

process.exit(1)