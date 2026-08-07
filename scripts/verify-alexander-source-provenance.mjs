import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const manifestUrl = new URL('../offline/reference/alexander-source-license-records.json', import.meta.url)
const liveCheck = process.argv.includes('--live')

const isRuntimeBundlePath = (path) => /(^|\/)(apps\/client|apps\/server|public|dist)(\/|$)/.test(path)

const isSha1 = (value) => /^[a-f0-9]{40}$/.test(value)
const isSha256 = (value) => /^[a-f0-9]{64}$/.test(value)

const hashRemote = async (url) => {
  const response = await fetch(url)
  assert.equal(response.ok, true, `download failed for ${url}: ${response.status} ${response.statusText}`)

  const hash = createHash('sha256')
  let byteLength = 0
  for await (const chunk of response.body) {
    hash.update(chunk)
    byteLength += chunk.length
  }

  return { sha256: hash.digest('hex'), byteLength }
}

const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))

assert.equal(manifest.manifestVersion, 1, 'manifestVersion must be 1')
assert.equal(manifest.artwork.status, 'public-domain', 'artwork must be recorded as public-domain')
assert.equal(manifest.assetPolicy.runtimeBundle, 'excluded', 'source assets must stay out of the runtime bundle')
assert.ok(Array.isArray(manifest.benchmarkImages), 'benchmarkImages must be an array')
assert.ok(manifest.benchmarkImages.length > 0, 'at least one benchmark image is required')

for (const image of manifest.benchmarkImages) {
  assert.match(image.originalUrl, /^https:\/\/upload\.wikimedia\.org\//, `${image.id} must use the immutable upload origin`)
  assert.match(image.sourcePageUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, `${image.id} must link to the Commons file page`)
  assert.equal(image.license.reuseTerms, 'Public domain', `${image.id} must use public-domain reuse terms`)
  assert.equal(image.license.attributionRequired, false, `${image.id} must not require attribution for reuse`)
  assert.ok(image.license.attribution, `${image.id} must still record attribution metadata when present`)
  assert.ok(isSha1(image.checksums.commonsSha1), `${image.id} must record Commons SHA-1`)
  assert.ok(isSha256(image.checksums.sha256), `${image.id} must record SHA-256`)
  assert.deepEqual(image.crop, {
    unit: 'source-pixel',
    x: 0,
    y: 0,
    width: image.pixelDimensions.width,
    height: image.pixelDimensions.height,
    description: 'Use the full source frame. No manual crop is applied before normalization.',
  }, `${image.id} crop must match the full source frame`)

  const workingSource = image.normalizedWorkingSource
  assert.ok(workingSource.expectedPath, `${image.id} must record the normalized working source path`)
  assert.equal(isRuntimeBundlePath(workingSource.expectedPath), false, `${image.id} normalized working source must not target a runtime bundle path`)
  assert.equal(workingSource.sourceImageId, image.id, `${image.id} normalized source must reference its source image`)
  assert.ok(Array.isArray(workingSource.recipe), `${image.id} normalized source must include a recipe`)
  assert.ok(workingSource.recipe.length >= 3, `${image.id} normalized source recipe must be reproducible`)

  const downloadStep = workingSource.recipe.find((step) => step.operation === 'download-original')
  assert.equal(downloadStep?.verifySha256, image.checksums.sha256, `${image.id} download step must verify the recorded SHA-256`)

  assert.equal(image.preprocessing.script, 'scripts/preprocess-alexander-source.mjs', `${image.id} must record the preprocessing generator`)
  assert.equal(isRuntimeBundlePath(image.preprocessing.expectedDirectory), false, `${image.id} preprocessing output must not target a runtime bundle path`)
  assert.equal(isRuntimeBundlePath(image.preprocessing.configPath), false, `${image.id} preprocessing config must not target a runtime bundle path`)
  assert.deepEqual(image.preprocessing.configurationRecords, [
    'colorSpace',
    'normalization',
    'denoising',
    'saliency',
    'generatorSeed',
  ], `${image.id} preprocessing config must record deterministic parameters`)
  assert.deepEqual(image.preprocessing.edgeRetentionTargets, [
    'face',
    'weapon',
    'horse',
    'contour',
  ], `${image.id} preprocessing must retain recognition-critical edge targets`)
  for (const [artifactName, artifactPath] of Object.entries(image.preprocessing.artifacts)) {
    assert.match(artifactPath, /^alexander-.+\.(bin|png)$/, `${image.id} preprocessing artifact ${artifactName} must be a generated Alexander artifact`)
  }

  if (liveCheck) {
    const remote = await hashRemote(image.originalUrl)
    assert.equal(remote.sha256, image.checksums.sha256, `${image.id} live SHA-256 mismatch`)
    assert.equal(remote.byteLength, image.byteLength, `${image.id} live byte length mismatch`)
  }
}

console.log(`Verified ${manifest.benchmarkImages.length} Alexander Mosaic source record${liveCheck ? ' with live checksum' : ''}.`)