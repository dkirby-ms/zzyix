import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { preprocessSource } from './preprocess-alexander-source.mjs'

const createSyntheticSource = async () => {
  const width = 32
  const height = 20
  const pixels = Buffer.alloc(width * height * 3)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3
      const isFaceOval = (x - 10) ** 2 / 18 + (y - 9) ** 2 / 30 < 1
      const isHorseEdge = x > 20 && y > 4 && y < 14
      const isWeaponLine = y === Math.floor(18 - x / 2)
      const isContour = x === 3 || y === 3 || x === width - 4 || y === height - 4

      pixels[offset] = isFaceOval ? 198 : isHorseEdge ? 76 : 138
      pixels[offset + 1] = isFaceOval ? 132 : isHorseEdge ? 74 : 116
      pixels[offset + 2] = isWeaponLine || isContour ? 24 : isHorseEdge ? 52 : 88
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer()
}

const testPipeline = {
  version: 1,
  generatorSeed: 'synthetic-preprocess-test-v1',
  colorSpace: {
    source: 'sRGB',
    working: 'CIELAB-D65',
    labEncoding: 'float32-little-endian',
  },
  resize: {
    width: 32,
    height: 20,
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

const testImage = {
  id: 'synthetic-alexander-like-source',
  normalizedWorkingSource: {
    recipe: [{ operation: 'resize', width: 32, height: 20 }],
  },
}

test('preprocessSource records deterministic LAB, denoising, and saliency artifacts', async () => {
  const sourceBuffer = await createSyntheticSource()
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'zzyix-preprocess-'))

  try {
    const first = await preprocessSource({
      sourceBuffer,
      outputDir: path.join(tempRoot, 'first'),
      image: testImage,
      pipeline: testPipeline,
    })
    const second = await preprocessSource({
      sourceBuffer,
      outputDir: path.join(tempRoot, 'second'),
      image: testImage,
      pipeline: testPipeline,
    })

    assert.equal(first.pipeline.colorSpace.working, 'CIELAB-D65')
    assert.equal(first.pipeline.normalization.method, 'deterministic-percentile-stretch')
    assert.equal(first.pipeline.denoising.method, 'bilateral-lab')
    assert.equal(first.pipeline.saliency.method, 'sobel-luminance-plus-local-contrast')
    assert.deepEqual(first.pipeline.retentionTargets, ['face', 'weapon', 'horse', 'contour'])
    assert.equal(first.pipeline.generatorSeed, 'synthetic-preprocess-test-v1')
    assert.equal(first.output.width, 32)
    assert.equal(first.output.height, 20)

    for (const artifactName of ['normalized', 'lab', 'luminance', 'denoised', 'saliency', 'edges']) {
      assert.equal(first.output.artifacts[artifactName].sha256, second.output.artifacts[artifactName].sha256, `${artifactName} artifact must be repeatable`)
    }

    const lab = await readFile(path.join(tempRoot, 'first', 'alexander-cielab-float32.bin'))
    assert.equal(lab.byteLength, 32 * 20 * 3 * 4)

    const { data: edgePixels } = await sharp(path.join(tempRoot, 'first', 'alexander-edge-mask.png'))
      .raw()
      .toBuffer({ resolveWithObject: true })
    const edgeCount = edgePixels.reduce((count, value) => count + (value > 0 ? 1 : 0), 0)
    assert.ok(edgeCount > 80, 'edge mask must retain enough synthetic face, weapon, horse, and contour edges')

    const firstConfig = JSON.parse(await readFile(path.join(tempRoot, 'first', 'alexander-preprocessing-config.json'), 'utf8'))
    const secondConfig = JSON.parse(await readFile(path.join(tempRoot, 'second', 'alexander-preprocessing-config.json'), 'utf8'))
    assert.deepEqual(firstConfig.pipeline, secondConfig.pipeline)
    assert.deepEqual(firstConfig.source, secondConfig.source)
    assert.deepEqual(firstConfig.output.luminancePercentiles, secondConfig.output.luminancePercentiles)
    assert.equal(firstConfig.output.edgeThreshold, secondConfig.output.edgeThreshold)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
