import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const manifestUrl = new URL('../offline/reference/alexander-source-license-records.json', import.meta.url)
const defaultOutputUrl = new URL('../offline/output/alexander-preprocessed/', import.meta.url)

const defaultPipeline = Object.freeze({
  version: 1,
  generatorSeed: 'alexander-mosaic-preprocess-v1',
  colorSpace: {
    source: 'sRGB',
    working: 'CIELAB-D65',
    labEncoding: 'float32-little-endian',
  },
  resize: {
    width: 1077,
    height: 1616,
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
    radius: 2,
    spatialSigma: 1.25,
    luminanceSigma: 7.5,
  },
  saliency: {
    method: 'sobel-luminance-plus-local-contrast',
    edgePercentile: 0.88,
    contrastRadius: 3,
    contrastWeight: 0.35,
  },
  retentionTargets: ['face', 'weapon', 'armour', 'contour'],
})

const artifactNames = Object.freeze({
  normalized: 'alexander-normalized-master.png',
  lab: 'alexander-cielab-float32.bin',
  luminance: 'alexander-luminance-normalized.png',
  denoised: 'alexander-denoised-preview.png',
  saliency: 'alexander-saliency-mask.png',
  edges: 'alexander-edge-mask.png',
  config: 'alexander-preprocessing-config.json',
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const stableStringify = (value) => `${JSON.stringify(sortObject(value), null, 2)}\n`

const maxValue = (values) => {
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    max = Math.max(max, value)
  }

  return max
}

const sortObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortObject)
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]))
  }

  return value
}

const parseArgs = (argv) => {
  const args = {
    live: false,
    manifest: fileURLToPath(manifestUrl),
    output: fileURLToPath(defaultOutputUrl),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--live') {
      args.live = true
    } else if (arg === '--source') {
      args.source = argv[++index]
    } else if (arg === '--output') {
      args.output = argv[++index]
    } else if (arg === '--manifest') {
      args.manifest = argv[++index]
    } else if (arg === '--image-id') {
      args.imageId = argv[++index]
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

const printHelp = () => {
  console.log(`Usage: node scripts/preprocess-alexander-source.mjs [--live | --source path] [--output path]\n\nOptions:\n  --live            Download the manifest source URL and verify its SHA-256.\n  --source path     Use an already downloaded source image file.\n  --output path     Write generated artifacts to this directory.\n  --manifest path   Use a provenance manifest other than the default.\n  --image-id id     Select a benchmark image record by id.\n`)
}

const readManifest = async (manifestPath) => JSON.parse(await readFile(manifestPath, 'utf8'))

const selectImage = (manifest, imageId) => {
  const image = imageId
    ? manifest.benchmarkImages.find((candidate) => candidate.id === imageId)
    : manifest.benchmarkImages[0]

  assert.ok(image, imageId ? `No benchmark image found for ${imageId}` : 'Manifest must include a benchmark image')
  return image
}

const downloadSource = async (image) => {
  const response = await fetch(image.originalUrl)
  assert.equal(response.ok, true, `download failed for ${image.originalUrl}: ${response.status} ${response.statusText}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  assert.equal(sha256(buffer), image.checksums.sha256, `${image.id} source SHA-256 mismatch`)
  return buffer
}

const readSource = async ({ sourcePath, live, image }) => {
  if (sourcePath) {
    const buffer = await readFile(sourcePath)
    if (image?.checksums?.sha256) {
      assert.equal(sha256(buffer), image.checksums.sha256, `${image.id} source SHA-256 mismatch`)
    }
    return buffer
  }

  assert.equal(live, true, 'Provide --source path or --live to download the manifest source image')
  return downloadSource(image)
}

const getTargetDimensions = (image, pipeline) => {
  const resizeStep = image?.normalizedWorkingSource?.recipe?.find((step) => step.operation === 'resize')
  return {
    width: resizeStep?.width ?? pipeline.resize.width,
    height: resizeStep?.height ?? pipeline.resize.height,
  }
}

const getCrop = (image) => {
  const cropStep = image?.normalizedWorkingSource?.recipe?.find((step) => step.operation === 'crop')
  const crop = cropStep?.box ?? image?.crop
  if (!crop) {
    return undefined
  }

  return {
    left: crop.x,
    top: crop.y,
    width: crop.width,
    height: crop.height,
  }
}

const decodeSource = async ({ sourceBuffer, image, pipeline }) => {
  const target = getTargetDimensions(image, pipeline)
  const crop = getCrop(image)
  let source = sharp(sourceBuffer, { limitInputPixels: false })
  if (crop) {
    source = source.extract(crop)
  }

  const { data, info } = await source
    .resize({
      width: target.width,
      height: target.height,
      fit: pipeline.resize.fit,
      kernel: pipeline.resize.kernel,
      withoutEnlargement: false,
    })
    .removeAlpha()
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    rgb: data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  }
}

const srgbByteToLinear = (value) => {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

const xyzToLabPivot = (value) => {
  const epsilon = 216 / 24389
  const kappa = 24389 / 27
  return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116
}

const rgbToLab = (rgb) => {
  const pixels = rgb.length / 3
  const lab = new Float32Array(pixels * 3)
  const luminance = new Float32Array(pixels)

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 3
    const red = srgbByteToLinear(rgb[offset])
    const green = srgbByteToLinear(rgb[offset + 1])
    const blue = srgbByteToLinear(rgb[offset + 2])

    const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047
    const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue
    const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883

    const fx = xyzToLabPivot(x)
    const fy = xyzToLabPivot(y)
    const fz = xyzToLabPivot(z)

    const l = 116 * fy - 16
    lab[offset] = l
    lab[offset + 1] = 500 * (fx - fy)
    lab[offset + 2] = 200 * (fy - fz)
    luminance[index] = l
  }

  return { lab, luminance }
}

const percentile = (values, quantile) => {
  const sorted = Array.from(values).sort((left, right) => left - right)
  return sorted[Math.floor((sorted.length - 1) * quantile)]
}

const normalizeLuminance = (luminance, normalization) => {
  const low = percentile(luminance, normalization.lowerPercentile)
  const high = percentile(luminance, normalization.upperPercentile)
  const scale = high > low ? 100 / (high - low) : 1
  const normalized = new Float32Array(luminance.length)
  const grayscale = Buffer.alloc(luminance.length)

  for (let index = 0; index < luminance.length; index += 1) {
    const value = clamp((luminance[index] - low) * scale, 0, 100)
    normalized[index] = value
    grayscale[index] = Math.round(value * 2.55)
  }

  return { normalized, grayscale, low, high }
}

const denoiseLab = ({ lab, normalizedLuminance, width, height, params }) => {
  const pixels = width * height
  const denoised = new Float32Array(lab.length)
  const spatialWeights = new Map()

  for (let y = -params.radius; y <= params.radius; y += 1) {
    for (let x = -params.radius; x <= params.radius; x += 1) {
      const distanceSquared = x * x + y * y
      spatialWeights.set(`${x},${y}`, Math.exp(-distanceSquared / (2 * params.spatialSigma * params.spatialSigma)))
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x
      const labOffset = pixel * 3
      const centerLuminance = normalizedLuminance[pixel]
      let weightTotal = 0
      let lTotal = 0
      let aTotal = 0
      let bTotal = 0

      for (let dy = -params.radius; dy <= params.radius; dy += 1) {
        const sampleY = y + dy
        if (sampleY < 0 || sampleY >= height) {
          continue
        }

        for (let dx = -params.radius; dx <= params.radius; dx += 1) {
          const sampleX = x + dx
          if (sampleX < 0 || sampleX >= width) {
            continue
          }

          const sample = sampleY * width + sampleX
          const sampleOffset = sample * 3
          const luminanceDelta = normalizedLuminance[sample] - centerLuminance
          const rangeWeight = Math.exp(-(luminanceDelta * luminanceDelta) / (2 * params.luminanceSigma * params.luminanceSigma))
          const weight = spatialWeights.get(`${dx},${dy}`) * rangeWeight
          weightTotal += weight
          lTotal += normalizedLuminance[sample] * weight
          aTotal += lab[sampleOffset + 1] * weight
          bTotal += lab[sampleOffset + 2] * weight
        }
      }

      denoised[labOffset] = lTotal / weightTotal
      denoised[labOffset + 1] = aTotal / weightTotal
      denoised[labOffset + 2] = bTotal / weightTotal
    }
  }

  assert.equal(denoised.length, pixels * 3)
  return denoised
}

const labPivotToXyz = (value) => {
  const valueCubed = value ** 3
  return valueCubed > 216 / 24389 ? valueCubed : (116 * value - 16) / (24389 / 27)
}

const linearToSrgbByte = (value) => {
  const channel = clamp(value, 0, 1)
  const srgb = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
  return Math.round(clamp(srgb, 0, 1) * 255)
}

const labToRgb = (lab) => {
  const rgb = Buffer.alloc(lab.length)
  for (let offset = 0; offset < lab.length; offset += 3) {
    const l = lab[offset]
    const a = lab[offset + 1]
    const b = lab[offset + 2]
    const fy = (l + 16) / 116
    const fx = a / 500 + fy
    const fz = fy - b / 200

    const x = 0.95047 * labPivotToXyz(fx)
    const y = labPivotToXyz(fy)
    const z = 1.08883 * labPivotToXyz(fz)

    rgb[offset] = linearToSrgbByte(3.2404542 * x - 1.5371385 * y - 0.4985314 * z)
    rgb[offset + 1] = linearToSrgbByte(-0.969266 * x + 1.8760108 * y + 0.041556 * z)
    rgb[offset + 2] = linearToSrgbByte(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)
  }

  return rgb
}

const sobelAt = (values, width, height, x, y) => {
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
    return 0
  }

  const topLeft = values[(y - 1) * width + x - 1]
  const top = values[(y - 1) * width + x]
  const topRight = values[(y - 1) * width + x + 1]
  const left = values[y * width + x - 1]
  const right = values[y * width + x + 1]
  const bottomLeft = values[(y + 1) * width + x - 1]
  const bottom = values[(y + 1) * width + x]
  const bottomRight = values[(y + 1) * width + x + 1]

  const gx = -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight
  const gy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
  return Math.hypot(gx, gy)
}

const localContrastAt = (values, width, height, x, y, radius) => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (let dy = -radius; dy <= radius; dy += 1) {
    const sampleY = y + dy
    if (sampleY < 0 || sampleY >= height) {
      continue
    }

    for (let dx = -radius; dx <= radius; dx += 1) {
      const sampleX = x + dx
      if (sampleX < 0 || sampleX >= width) {
        continue
      }

      const value = values[sampleY * width + sampleX]
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
  }

  return max - min
}

const createMasks = ({ denoisedLab, width, height, params }) => {
  const pixels = width * height
  const scores = new Float32Array(pixels)
  const gradients = new Float32Array(pixels)
  const luminance = new Float32Array(pixels)

  for (let index = 0; index < pixels; index += 1) {
    luminance[index] = denoisedLab[index * 3]
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const gradient = sobelAt(luminance, width, height, x, y)
      const contrast = localContrastAt(luminance, width, height, x, y, params.contrastRadius)
      gradients[index] = gradient
      scores[index] = gradient + contrast * params.contrastWeight
    }
  }

  const threshold = percentile(scores, params.edgePercentile)
  const maxScore = maxValue(scores)
  const edgeMask = Buffer.alloc(pixels)
  const saliencyMask = Buffer.alloc(pixels)

  for (let index = 0; index < pixels; index += 1) {
    saliencyMask[index] = maxScore > 0 ? Math.round(clamp(scores[index] / maxScore, 0, 1) * 255) : 0
    edgeMask[index] = scores[index] >= threshold && gradients[index] > 0 ? 255 : 0
  }

  return { edgeMask, saliencyMask, threshold }
}

const calculateFeatureCoverage = ({ featureRegions = [], edgeMask, saliencyMask, width, height }) => featureRegions.map((region) => {
  assert.ok(Number.isInteger(region.x) && Number.isInteger(region.y), `${region.target} region must use integer coordinates`)
  assert.ok(Number.isInteger(region.width) && region.width > 0, `${region.target} region width must be a positive integer`)
  assert.ok(Number.isInteger(region.height) && region.height > 0, `${region.target} region height must be a positive integer`)
  assert.ok(region.x >= 0 && region.y >= 0 && region.x + region.width <= width && region.y + region.height <= height, `${region.target} region must stay within output dimensions`)

  let edgePixelCount = 0
  let saliencyTotal = 0
  const pixelCount = region.width * region.height
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const index = y * width + x
      edgePixelCount += edgeMask[index] > 0 ? 1 : 0
      saliencyTotal += saliencyMask[index]
    }
  }

  assert.ok(edgePixelCount >= region.minimumEdgePixels, `${region.target} region must retain at least ${region.minimumEdgePixels} edge pixels`)
  return {
    target: region.target,
    box: { x: region.x, y: region.y, width: region.width, height: region.height },
    edgePixelCount,
    saliencyMean: saliencyTotal / pixelCount / 255,
  }
})

const pngFromRaw = async ({ raw, width, height, channels = 3 }) => sharp(raw, {
  raw: { width, height, channels },
}).png({ compressionLevel: 9, palette: false }).toBuffer()

const writeArtifact = async ({ outputDir, fileName, buffer }) => {
  const artifactPath = path.join(outputDir, fileName)
  await writeFile(artifactPath, buffer)
  return {
    path: path.relative(process.cwd(), artifactPath),
    bytes: buffer.byteLength,
    sha256: sha256(buffer),
  }
}

const float32Buffer = (values) => Buffer.from(values.buffer, values.byteOffset, values.byteLength)

export const preprocessSource = async ({ sourceBuffer, outputDir, image, pipeline = defaultPipeline }) => {
  await mkdir(outputDir, { recursive: true })

  const decoded = await decodeSource({ sourceBuffer, image, pipeline })
  assert.equal(decoded.channels, 3, 'decoded source must have three sRGB channels')

  const normalizedPng = await pngFromRaw({ raw: decoded.rgb, width: decoded.width, height: decoded.height, channels: 3 })
  const { lab, luminance } = rgbToLab(decoded.rgb)
  const normalized = normalizeLuminance(luminance, pipeline.normalization)

  for (let index = 0; index < normalized.normalized.length; index += 1) {
    lab[index * 3] = normalized.normalized[index]
  }

  const denoisedLab = denoiseLab({
    lab,
    normalizedLuminance: normalized.normalized,
    width: decoded.width,
    height: decoded.height,
    params: pipeline.denoising,
  })
  const masks = createMasks({ denoisedLab, width: decoded.width, height: decoded.height, params: pipeline.saliency })
  const featureCoverage = calculateFeatureCoverage({
    featureRegions: image?.preprocessing?.featureRegions,
    edgeMask: masks.edgeMask,
    saliencyMask: masks.saliencyMask,
    width: decoded.width,
    height: decoded.height,
  })

  const luminancePng = await pngFromRaw({ raw: normalized.grayscale, width: decoded.width, height: decoded.height, channels: 1 })
  const denoisedPng = await pngFromRaw({ raw: labToRgb(denoisedLab), width: decoded.width, height: decoded.height, channels: 3 })
  const saliencyPng = await pngFromRaw({ raw: masks.saliencyMask, width: decoded.width, height: decoded.height, channels: 1 })
  const edgePng = await pngFromRaw({ raw: masks.edgeMask, width: decoded.width, height: decoded.height, channels: 1 })

  const artifacts = {
    normalized: await writeArtifact({ outputDir, fileName: artifactNames.normalized, buffer: normalizedPng }),
    lab: await writeArtifact({ outputDir, fileName: artifactNames.lab, buffer: float32Buffer(lab) }),
    luminance: await writeArtifact({ outputDir, fileName: artifactNames.luminance, buffer: luminancePng }),
    denoised: await writeArtifact({ outputDir, fileName: artifactNames.denoised, buffer: denoisedPng }),
    saliency: await writeArtifact({ outputDir, fileName: artifactNames.saliency, buffer: saliencyPng }),
    edges: await writeArtifact({ outputDir, fileName: artifactNames.edges, buffer: edgePng }),
  }

  const config = {
    manifestVersion: 1,
    pipeline,
    source: {
      imageId: image?.id ?? 'synthetic-test-source',
      sha256: sha256(sourceBuffer),
      byteLength: sourceBuffer.byteLength,
      expectedSha256: image?.checksums?.sha256 ?? null,
    },
    output: {
      width: decoded.width,
      height: decoded.height,
      luminancePercentiles: {
        lower: normalized.low,
        upper: normalized.high,
      },
      edgeThreshold: masks.threshold,
      featureCoverage,
      artifacts,
    },
  }

  const configBuffer = Buffer.from(stableStringify(config), 'utf8')
  await writeFile(path.join(outputDir, artifactNames.config), configBuffer)
  config.configArtifact = {
    path: path.relative(process.cwd(), path.join(outputDir, artifactNames.config)),
    bytes: configBuffer.byteLength,
    sha256: sha256(configBuffer),
  }

  return config
}

const runCli = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const manifest = await readManifest(args.manifest)
  const image = selectImage(manifest, args.imageId)
  const sourceBuffer = await readSource({ sourcePath: args.source, live: args.live, image })
  const config = await preprocessSource({ sourceBuffer, outputDir: path.resolve(args.output), image })

  console.log(`Generated preprocessing artifacts for ${config.source.imageId}:`)
  for (const [name, artifact] of Object.entries(config.output.artifacts)) {
    console.log(`- ${name}: ${artifact.path} (${artifact.sha256})`)
  }
  console.log(`- config: ${config.configArtifact.path} (${config.configArtifact.sha256})`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
