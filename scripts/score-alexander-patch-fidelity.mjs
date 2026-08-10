import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { manifestContentHash } from './generate-alexander-patch-manifest.mjs'

const defaultManifestUrl = new URL('../offline/output/alexander-mosaic-inputs/alexander-patch-manifest.json', import.meta.url)
const defaultOutputUrl = new URL('../offline/output/alexander-mosaic-inputs/alexander-fidelity-report.json', import.meta.url)

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const stableStringify = (value) => `${JSON.stringify(sortObject(value), null, 2)}\n`
const sortObject = (value) => {
  if (Array.isArray(value)) return value.map(sortObject)
  if (value && typeof value === 'object' && value.constructor === Object) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]))
  return value
}
const resolvePath = (value) => path.resolve(process.cwd(), value)
const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'))
const parseHex = (hex) => [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset + 1, offset + 3), 16))
const clampBox = (box, width, height) => ({
  x: Math.max(0, Math.min(width, Math.floor(box.x))),
  y: Math.max(0, Math.min(height, Math.floor(box.y))),
  maxX: Math.max(0, Math.min(width, Math.ceil(box.x + box.width))),
  maxY: Math.max(0, Math.min(height, Math.ceil(box.y + box.height))),
})
const inside = (x, y, box) => x >= box.x && x < box.maxX && y >= box.y && y < box.maxY

export const scorePatchFidelity = async ({ manifestPath, outputPath, thresholds = { colorErrorMax: 0.35, edgeRetentionMin: 0.25, featureCoverageMin: 0.05 } }) => {
  const manifestFilePath = resolvePath(manifestPath)
  const manifest = await readJson(manifestFilePath)
  assert.equal(manifest.schemaVersion, 1, 'unsupported manifest schema')
  assert.equal(manifestContentHash(manifest), manifest.provenance.manifestSha256, 'manifest provenance hash mismatch')
  const manifestBuffer = await readFile(manifestFilePath)
  const normalizedPath = resolvePath(manifest.source.normalizedArtifact.path)
  assert.equal(sha256(await readFile(normalizedPath)), manifest.source.normalizedArtifact.sha256, 'normalized source hash mismatch')
  const normalized = await sharp(normalizedPath).raw().toBuffer({ resolveWithObject: true })
  assert.deepEqual({ width: normalized.info.width, height: normalized.info.height }, manifest.source.dimensions, 'normalized source dimensions mismatch')

  const raster = Buffer.alloc(normalized.info.width * normalized.info.height * 3)
  const covered = Buffer.alloc(normalized.info.width * normalized.info.height)
  for (const placement of manifest.placements) {
    const box = clampBox(placement.source.box, normalized.info.width, normalized.info.height)
    const color = parseHex(placement.tile.color)
    for (let y = box.y; y < box.maxY; y += 1) for (let x = box.x; x < box.maxX; x += 1) {
      const pixel = y * normalized.info.width + x
      raster[pixel * 3] = color[0]
      raster[pixel * 3 + 1] = color[1]
      raster[pixel * 3 + 2] = color[2]
      covered[pixel] = 1
    }
  }

  let colorErrorTotal = 0
  let coveredPixels = 0
  for (let pixel = 0; pixel < covered.length; pixel += 1) if (covered[pixel]) {
    coveredPixels += 1
    const offset = pixel * 3
    colorErrorTotal += Math.abs(raster[offset] - normalized.data[offset]) + Math.abs(raster[offset + 1] - normalized.data[offset + 1]) + Math.abs(raster[offset + 2] - normalized.data[offset + 2])
  }
  const colorError = coveredPixels === 0 ? 1 : colorErrorTotal / (coveredPixels * 3 * 255)
  const edgePath = manifest.source.preprocessingConfig.path.replace('alexander-preprocessing-config.json', 'alexander-edge-mask.png')
  const edgeMask = await sharp(resolvePath(edgePath)).raw().toBuffer({ resolveWithObject: true })
  let coveredEdgePixels = 0
  let totalEdgePixels = 0
  for (let pixel = 0; pixel < covered.length; pixel += 1) {
    if (edgeMask.data[pixel] > 0) {
      totalEdgePixels += 1
      if (covered[pixel]) coveredEdgePixels += 1
    }
  }
  const edgeRetention = totalEdgePixels === 0 ? 0 : coveredEdgePixels / totalEdgePixels
  const featureCoverage = (manifest.featureCoverage.available ?? []).map((target) => {
    const feature = manifest.source.featureRegions?.find((entry) => entry.target === target)
    const sourceFeature = feature?.box ?? null
    if (!sourceFeature) return { target, supported: false, coverage: null }
    const featureBox = clampBox(sourceFeature, normalized.info.width, normalized.info.height)
    let area = 0
    let selected = 0
    for (let y = featureBox.y; y < featureBox.maxY; y += 1) for (let x = featureBox.x; x < featureBox.maxX; x += 1) {
      area += 1
      if (inside(x, y, featureBox) && covered[y * normalized.info.width + x]) selected += 1
    }
    return { target, supported: true, coverage: area === 0 ? 0 : selected / area }
  })
  const featureEvidence = featureCoverage.map((feature) => ({ ...feature, pass: !feature.supported || feature.coverage >= thresholds.featureCoverageMin }))
  const checks = {
    colorError: { value: colorError, threshold: thresholds.colorErrorMax, comparator: '<=', pass: colorError <= thresholds.colorErrorMax },
    edgeRetention: { value: edgeRetention, threshold: thresholds.edgeRetentionMin, comparator: '>=', pass: edgeRetention >= thresholds.edgeRetentionMin },
    featureCoverage: { threshold: thresholds.featureCoverageMin, comparator: '>=', pass: featureEvidence.every((feature) => feature.pass), evidence: featureEvidence },
  }
  const report = {
    schemaVersion: 1,
    source: { imageId: manifest.source.imageId, normalizedArtifact: manifest.source.normalizedArtifact, manifestSha256: manifest.provenance.manifestSha256 },
    manifest: { path: path.relative(process.cwd(), manifestFilePath), bytes: manifestBuffer.byteLength, sha256: sha256(manifestBuffer), canonicalContentSha256: manifest.provenance.manifestSha256 },
    thresholds,
    measurements: { placements: manifest.placements.length, coveredPixels, colorError, edgeRetention, skipped: manifest.skippedCandidates.length, conflicts: manifest.skippedCandidates.filter((entry) => entry.reason === 'collision').length, outOfBounds: manifest.skippedCandidates.filter((entry) => entry.reason === 'out-of-bounds').length },
    checks,
    pass: Object.values(checks).every((check) => check.pass),
  }
  const reportPath = resolvePath(outputPath)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, stableStringify(report))
  return { ...report, artifact: { path: path.relative(process.cwd(), reportPath), bytes: Buffer.byteLength(stableStringify(report)), sha256: sha256(stableStringify(report)) } }
}

const parseArgs = (argv) => {
  const args = { manifest: fileURLToPath(defaultManifestUrl), output: fileURLToPath(defaultOutputUrl) }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--manifest') args.manifest = argv[++index]
    else if (arg === '--output') args.output = argv[++index]
    else if (arg === '--color-error-max') args.colorErrorMax = Number(argv[++index])
    else if (arg === '--edge-retention-min') args.edgeRetentionMin = Number(argv[++index])
    else if (arg === '--feature-coverage-min') args.featureCoverageMin = Number(argv[++index])
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) console.log('Usage: node scripts/score-alexander-patch-fidelity.mjs [--manifest path] [--output path] [--color-error-max n] [--edge-retention-min n] [--feature-coverage-min n]')
  else {
    const result = await scorePatchFidelity({ manifestPath: args.manifest, outputPath: args.output, thresholds: { colorErrorMax: args.colorErrorMax ?? 0.35, edgeRetentionMin: args.edgeRetentionMin ?? 0.25, featureCoverageMin: args.featureCoverageMin ?? 0.05 } })
    console.log(`Fidelity ${result.pass ? 'passed' : 'failed'} (${result.artifact.sha256}).`)
    if (!result.pass) process.exitCode = 1
  }
}