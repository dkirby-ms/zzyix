import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  ALEXANDER_V1_DEFAULTS,
  CANONICAL_TOPOLOGY,
  MATERIAL_VARIANTS,
  TILE_SHAPES,
  assertSupportedPlacement,
  canonicalizeWorldPoint,
  deriveFootprint,
  mapSourcePointToWorld,
  generatePatchManifest,
} from './generate-alexander-patch-manifest.mjs'

const writeJson = async (filePath, value) => {
  const contents = `${JSON.stringify(value, null, 2)}\n`
  await writeFile(filePath, contents)
  return createHash('sha256').update(contents).digest('hex')
}

test('mirrors the client and server supported tile enums', async () => {
  const [clientGeometry, serverContracts] = await Promise.all([
    readFile(new URL('../apps/client/src/domain/tileGeometry.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/server/src/contracts.ts', import.meta.url), 'utf8'),
  ])

  for (const shape of TILE_SHAPES) {
    assert.match(clientGeometry, new RegExp(`['"]${shape.replace('-', '\\-')}['"]`))
    assert.match(serverContracts, new RegExp(`['"]${shape.replace('-', '\\-')}['"]`))
  }
  for (const material of MATERIAL_VARIANTS) {
    assert.match(clientGeometry, new RegExp(`['"]${material}['"]`))
    assert.match(serverContracts, new RegExp(`['"]${material}['"]`))
  }
})

test('uses the canonical finite toroidal topology and wraps coordinates', () => {
  assert.deepEqual(CANONICAL_TOPOLOGY, {
    patchRows: 32,
    patchColumns: 32,
    patchWidth: 31.2,
    patchHeight: 20.4,
    originX: 0,
    originY: 0,
  })
  assert.deepEqual(canonicalizeWorldPoint({ x: -0.25, y: 32 * 20.4 + 0.5 }), { x: 32 * 31.2 - 0.25, y: 0.5 })
})

test('maps an explicit source-to-world transform without inferring a target', () => {
  const position = mapSourcePointToWorld({
    point: { x: 538.5, y: 808 },
    sourceDimensions: { width: 1077, height: 1616 },
    targetRect: { minX: 0, maxX: 31.2, minY: 0, maxY: 20.4 },
    transform: {
      origin: { x: 0, y: 0 },
      scale: { x: 31.2, y: 20.4 },
    },
  })
  assert.deepEqual(position, { x: 15.6, y: 10.2 })
})

test('matches the client square footprint and conservative v1 geometry policy', () => {
  assert.deepEqual(ALEXANDER_V1_DEFAULTS.geometry, {
    shape: 'square',
    material: 'ceramic',
    rotation: 0,
    mirrored: false,
  })
  assert.deepEqual(deriveFootprint({
    shape: 'square',
    position: { x: 0, y: 0 },
    rotation: 0,
  }), { minX: -0.44, maxX: 0.44, minY: -0.44, maxY: 0.44 })
})

test('rejects unsupported or non-finite placement attributes before generation', () => {
  assert.throws(() => assertSupportedPlacement({
    shape: 'hexagon',
    material: 'ceramic',
    position: { x: 0, y: 0 },
    rotation: 0,
  }), /Unsupported tile shape/)
  assert.throws(() => assertSupportedPlacement({
    shape: 'square',
    material: 'ceramic',
    position: { x: Number.NaN, y: 0 },
    rotation: 0,
  }), /must be finite/)
})

test('generates stable placements and records deterministic skips, budgets, and feature coverage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'zzyix-manifest-'))
  try {
    const palettePath = path.join(root, 'palette.json')
    const candidatesPath = path.join(root, 'candidates.json')
    const preprocessingPath = path.join(root, 'preprocessing.json')
    const normalizedPath = path.join(root, 'normalized.bin')
    await writeFile(normalizedPath, 'normalized')
    const preprocessing = {
      source: { imageId: 'synthetic', sha256: 'source-hash' },
      output: { width: 10, height: 10, featureCoverage: [{ target: 'face', box: { x: 4, y: 4, width: 2, height: 2 } }], artifacts: { normalized: { path: normalizedPath } } },
    }
    const preprocessingHash = await writeJson(preprocessingPath, preprocessing)
    const palette = { palette: [{ id: 'palette-001', hex: '#646464' }] }
    const paletteHash = await writeJson(palettePath, palette)
    const candidates = {
      coordinateSpace: { width: 10, height: 10, unit: 'preprocessed-source-pixel' },
      candidates: [
        { id: 'candidate-a', anchor: { x: 5, y: 5 }, box: { x: 4, y: 4, width: 2, height: 2 }, score: 1, paletteId: 'palette-001', paletteDeltaE: 1 },
        { id: 'candidate-a', anchor: { x: 5, y: 5 }, box: { x: 4, y: 4, width: 2, height: 2 }, score: 0.9, paletteId: 'palette-001', paletteDeltaE: 1 },
        { id: 'candidate-b', anchor: { x: 5.2, y: 5.2 }, box: { x: 4, y: 4, width: 2, height: 2 }, score: 0.8, paletteId: 'palette-001', paletteDeltaE: 1 },
        { id: 'candidate-c', anchor: { x: 0, y: 0 }, box: { x: 0, y: 0, width: 2, height: 2 }, score: 0.7, paletteId: 'palette-001', paletteDeltaE: 1 },
        { id: 'candidate-d', anchor: { x: 8, y: 8 }, box: { x: 7, y: 7, width: 2, height: 2 }, score: 0.6, paletteId: 'palette-001', paletteDeltaE: 1 },
      ],
    }
    const candidatesHash = await writeJson(candidatesPath, candidates)
    const inputConfigPath = path.join(root, 'inputs.json')
    await writeJson(inputConfigPath, {
      source: { preprocessingConfigSha256: preprocessingHash },
      output: { width: 10, height: 10, paletteSize: 1, candidateCount: candidates.candidates.length, artifacts: { palette: { path: palettePath, sha256: paletteHash }, candidates: { path: candidatesPath, sha256: candidatesHash } } },
      pipeline: { generatorSeed: 'fixture-seed' },
    })
    const first = await generatePatchManifest({ mosaicInputsConfigPath: inputConfigPath, preprocessingConfigPath: preprocessingPath, outputPath: path.join(root, 'manifest-a.json'), candidateBudget: 4, placementBudget: 2, target: { quiltId: 'q', patchId: 'p', targetRect: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, sourceToWorld: { origin: { x: 0, y: 0 }, scale: { x: 10, y: 10 } } } })
    const second = await generatePatchManifest({ mosaicInputsConfigPath: inputConfigPath, preprocessingConfigPath: preprocessingPath, outputPath: path.join(root, 'manifest-b.json'), candidateBudget: 4, placementBudget: 2, target: { quiltId: 'q', patchId: 'p', targetRect: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, sourceToWorld: { origin: { x: 0, y: 0 }, scale: { x: 10, y: 10 } } } })
    assert.equal(first.artifact.sha256, second.artifact.sha256)
    assert.equal(first.placements.length, 1)
    assert.deepEqual(first.featureCoverage.selected, ['face'])
    assert.deepEqual(first.skippedCandidates.map((entry) => entry.reason), ['duplicate-candidate-id', 'collision', 'out-of-bounds', 'candidate-budget-exceeded'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})