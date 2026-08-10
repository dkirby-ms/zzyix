import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { scorePatchFidelity } from './score-alexander-patch-fidelity.mjs'
import { manifestContentHash } from './generate-alexander-patch-manifest.mjs'

const makeManifest = (root, color = '#646464') => {
  const normalizedPath = path.join(root, 'normalized.png')
  const edgePath = path.join(root, 'alexander-edge-mask.png')
  return Promise.all([
    sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 100, g: 100, b: 100 } } }).png().toFile(normalizedPath),
    sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } } }).grayscale().png().toFile(edgePath),
  ]).then(async () => {
    const manifest = {
      schemaVersion: 1,
      source: { imageId: 'synthetic', dimensions: { width: 8, height: 8 }, normalizedArtifact: { path: normalizedPath, sha256: '' }, preprocessingConfig: { path: path.join(root, 'alexander-preprocessing-config.json') } },
      placements: [{ source: { box: { x: 0, y: 0, width: 8, height: 8 } }, tile: { color } }],
      skippedCandidates: [],
      featureCoverage: { available: [] },
    }
    const normalizedBuffer = await readFile(normalizedPath)
    manifest.source.normalizedArtifact.sha256 = (await import('node:crypto')).createHash('sha256').update(normalizedBuffer).digest('hex')
    manifest.source.preprocessingConfig.path = path.join(root, 'alexander-preprocessing-config.json')
    await writeFile(manifest.source.preprocessingConfig.path, '{}')
    manifest.provenance = { manifestSha256: '' }
    manifest.provenance.manifestSha256 = manifestContentHash(manifest)
    const manifestPath = path.join(root, 'manifest.json')
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    return manifestPath
  })
}

test('fidelity scorer reports deterministic pass evidence and provenance', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zzyix-fidelity-'))
  try {
    const manifestPath = await makeManifest(root)
    const first = await scorePatchFidelity({ manifestPath, outputPath: path.join(root, 'report-a.json'), thresholds: { colorErrorMax: 0.01, edgeRetentionMin: 1, featureCoverageMin: 0.05 } })
    const second = await scorePatchFidelity({ manifestPath, outputPath: path.join(root, 'report-b.json'), thresholds: { colorErrorMax: 0.01, edgeRetentionMin: 1, featureCoverageMin: 0.05 } })
    assert.equal(first.pass, true)
    assert.equal(first.measurements.colorError, 0)
    assert.equal(first.measurements.edgeRetention, 1)
    assert.equal(first.artifact.sha256, second.artifact.sha256)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fidelity scorer fails a known color error at a strict threshold', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zzyix-fidelity-fail-'))
  try {
    const manifestPath = await makeManifest(root, '#ffffff')
    const report = await scorePatchFidelity({ manifestPath, outputPath: path.join(root, 'report.json'), thresholds: { colorErrorMax: 0.01, edgeRetentionMin: 1, featureCoverageMin: 0.05 } })
    assert.equal(report.pass, false)
    assert.equal(report.checks.colorError.pass, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})