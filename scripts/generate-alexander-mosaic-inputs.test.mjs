import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { generateMosaicInputs } from './generate-alexander-mosaic-inputs.mjs'
import { preprocessSource } from './preprocess-alexander-source.mjs'

const createSyntheticSource = async () => {
  const width = 36
  const height = 24
  const pixels = Buffer.alloc(width * height * 3)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3
      const isFaceOval = (x - 11) ** 2 / 22 + (y - 10) ** 2 / 34 < 1
      const isHorseEdge = x > 22 && y > 5 && y < 17
      const isWeaponLine = y === Math.floor(20 - x / 2)
      const isContour = x === 3 || y === 3 || x === width - 4 || y === height - 4

      pixels[offset] = isFaceOval ? 204 : isHorseEdge ? 70 : 140
      pixels[offset + 1] = isFaceOval ? 138 : isHorseEdge ? 76 : 112
      pixels[offset + 2] = isWeaponLine || isContour ? 22 : isHorseEdge ? 50 : 90
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer()
}

const preprocessPipeline = {
  version: 1,
  generatorSeed: 'synthetic-preprocess-test-v1',
  colorSpace: {
    source: 'sRGB',
    working: 'CIELAB-D65',
    labEncoding: 'float32-little-endian',
  },
  resize: {
    width: 36,
    height: 24,
    fit: 'inside',
    kernel: 'lanczos3',
  },
  normalization: {
    channel: 'L*',
    method: 'deterministic-percentile-stretch',
    lowerPercentile: 0.01,
    upperPercentile: 0.99,
    outputRange: [0, 100],
  },
  denoising: {
    method: 'bilateral-lab',
    radius: 1,
    spatialSigma: 1.1,
    luminanceSigma: 6,
  },
  saliency: {
    method: 'sobel-luminance-plus-local-contrast',
    edgePercentile: 0.72,
    contrastRadius: 2,
    contrastWeight: 0.35,
  },
  retentionTargets: ['face', 'weapon', 'horse', 'contour'],
}

const mosaicPipeline = {
  version: 1,
  generatorSeed: 'synthetic-mosaic-inputs-test-v1',
  palette: {
    method: 'weighted-lab-bin-diverse-selection',
    size: 6,
    binCount: 6,
    saliencyWeight: 3,
    edgeWeight: 1.5,
    minimumDeltaE: 4,
  },
  candidates: {
    method: 'edge-saliency-cell-ranking',
    count: 12,
    minimumCellSize: 4,
    saliencyWeight: 0.35,
    edgeWeight: 0.55,
    contrastWeight: 0.1,
  },
}

const testImage = {
  id: 'synthetic-alexander-like-source',
  normalizedWorkingSource: {
    recipe: [{ operation: 'resize', width: 36, height: 24 }],
  },
}

test('generateMosaicInputs derives deterministic palette and tile candidates from preprocessing artifacts', async () => {
  const sourceBuffer = await createSyntheticSource()
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'zzyix-mosaic-inputs-'))

  try {
    await preprocessSource({
      sourceBuffer,
      outputDir: path.join(tempRoot, 'preprocessed'),
      image: testImage,
      pipeline: preprocessPipeline,
    })

    const preprocessingConfigPath = path.join(tempRoot, 'preprocessed', 'alexander-preprocessing-config.json')
    const first = await generateMosaicInputs({
      preprocessingConfigPath,
      outputDir: path.join(tempRoot, 'first'),
      pipeline: mosaicPipeline,
    })
    const second = await generateMosaicInputs({
      preprocessingConfigPath,
      outputDir: path.join(tempRoot, 'second'),
      pipeline: mosaicPipeline,
    })

    assert.equal(first.pipeline.generatorSeed, 'synthetic-mosaic-inputs-test-v1')
    assert.ok(first.output.paletteSize >= 5)
    assert.equal(first.output.candidateCount, 12)
    assert.equal(first.output.artifacts.palette.sha256, second.output.artifacts.palette.sha256)
    assert.equal(first.output.artifacts.candidates.sha256, second.output.artifacts.candidates.sha256)
    assert.deepEqual(first.pipeline, second.pipeline)
    assert.deepEqual(first.source, second.source)
    assert.equal(first.output.paletteSize, second.output.paletteSize)
    assert.equal(first.output.candidateCount, second.output.candidateCount)

    const palette = JSON.parse(await readFile(path.join(tempRoot, 'first', 'alexander-mosaic-palette.json'), 'utf8'))
    const candidates = JSON.parse(await readFile(path.join(tempRoot, 'first', 'alexander-tile-candidates.json'), 'utf8'))

    assert.equal(palette.colorSpace, 'CIELAB-D65')
    assert.equal(palette.palette.length, first.output.paletteSize)
    assert.ok(palette.palette.length <= 6)
    assert.ok(palette.palette.every((color) => /^#[0-9a-f]{6}$/.test(color.hex)))
    assert.equal(new Set(palette.palette.map((color) => color.id)).size, palette.palette.length)

    assert.equal(candidates.coordinateSpace.width, 36)
    assert.equal(candidates.coordinateSpace.height, 24)
    assert.equal(candidates.candidates.length, 12)
    assert.ok(candidates.candidates[0].score >= candidates.candidates.at(-1).score)
    assert.ok(candidates.candidates.some((candidate) => candidate.edgePixelCount > 0), 'tile candidates must include edge-bearing cells')
    assert.ok(candidates.candidates.every((candidate) => palette.palette.some((color) => color.id === candidate.paletteId)))
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
