import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const defaultPreprocessingConfigUrl = new URL('../offline/output/alexander-preprocessed/alexander-preprocessing-config.json', import.meta.url)
const defaultOutputUrl = new URL('../offline/output/alexander-mosaic-inputs/', import.meta.url)

const defaultPipeline = Object.freeze({
  version: 1,
  generatorSeed: 'alexander-mosaic-inputs-v1',
  palette: {
    method: 'weighted-lab-bin-diverse-selection',
    size: 24,
    binCount: 8,
    saliencyWeight: 3,
    edgeWeight: 1.5,
    minimumDeltaE: 8,
  },
  candidates: {
    method: 'edge-saliency-cell-ranking',
    count: 768,
    minimumCellSize: 8,
    saliencyWeight: 0.35,
    edgeWeight: 0.55,
    contrastWeight: 0.1,
  },
})

const artifactNames = Object.freeze({
  palette: 'alexander-mosaic-palette.json',
  candidates: 'alexander-tile-candidates.json',
  config: 'alexander-mosaic-inputs-config.json',
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const stableStringify = (value) => `${JSON.stringify(sortObject(value), null, 2)}\n`

const sortObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortObject)
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]))
  }

  return value
}

const round = (value, precision = 4) => Number(value.toFixed(precision))

const parseArgs = (argv) => {
  const args = {
    input: fileURLToPath(defaultPreprocessingConfigUrl),
    output: fileURLToPath(defaultOutputUrl),
    paletteSize: defaultPipeline.palette.size,
    candidateCount: defaultPipeline.candidates.count,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') {
      args.input = argv[++index]
    } else if (arg === '--output') {
      args.output = argv[++index]
    } else if (arg === '--palette-size') {
      args.paletteSize = Number.parseInt(argv[++index], 10)
    } else if (arg === '--candidate-count') {
      args.candidateCount = Number.parseInt(argv[++index], 10)
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

const printHelp = () => {
  console.log(`Usage: node scripts/generate-alexander-mosaic-inputs.mjs [--input path] [--output path]\n\nOptions:\n  --input path         Read a preprocessing config JSON file.\n  --output path        Write palette and candidate artifacts to this directory.\n  --palette-size n     Number of weighted LAB palette colors.\n  --candidate-count n  Maximum number of tile candidates.\n`)
}

const resolveArtifactPath = (artifactPath) => path.resolve(process.cwd(), artifactPath)

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'))

const readLab = async ({ preprocessingConfig }) => {
  const labPath = resolveArtifactPath(preprocessingConfig.output.artifacts.lab.path)
  const buffer = await readFile(labPath)
  assert.equal(buffer.byteLength % 4, 0, 'LAB artifact byte length must align to float32 values')
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
}

const readMask = async ({ artifactPath, width, height }) => {
  const { data, info } = await sharp(resolveArtifactPath(artifactPath))
    .raw()
    .toBuffer({ resolveWithObject: true })

  assert.equal(info.width, width, `${artifactPath} width must match preprocessing config`)
  assert.equal(info.height, height, `${artifactPath} height must match preprocessing config`)
  if (info.channels === 1) {
    return data
  }

  assert.ok(info.channels >= 3, `${artifactPath} must decode to one or more color channels`)
  const mask = Buffer.alloc(width * height)
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = data[index * info.channels]
  }

  return mask
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

const labToRgb = ({ l, a, b }) => {
  const fy = (l + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200
  const x = 0.95047 * labPivotToXyz(fx)
  const y = labPivotToXyz(fy)
  const z = 1.08883 * labPivotToXyz(fz)

  return {
    r: linearToSrgbByte(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    g: linearToSrgbByte(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    b: linearToSrgbByte(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  }
}

const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`

const deltaE = (left, right) => Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b)

const labBinKey = ({ l, a, b, binCount }) => {
  const lBin = clamp(Math.floor((l / 100) * binCount), 0, binCount - 1)
  const aBin = clamp(Math.floor(((a + 128) / 256) * binCount), 0, binCount - 1)
  const bBin = clamp(Math.floor(((b + 128) / 256) * binCount), 0, binCount - 1)
  return `${lBin}:${aBin}:${bBin}`
}

const extractPalette = ({ lab, saliency, edges, pipeline }) => {
  const bins = new Map()
  const pixels = saliency.length

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 3
    const color = { l: lab[offset], a: lab[offset + 1], b: lab[offset + 2] }
    const weight = 1 + (saliency[index] / 255) * pipeline.saliencyWeight + (edges[index] > 0 ? pipeline.edgeWeight : 0)
    const key = labBinKey({ ...color, binCount: pipeline.binCount })
    const bin = bins.get(key) ?? {
      l: 0,
      a: 0,
      b: 0,
      weight: 0,
      pixelCount: 0,
      saliencyTotal: 0,
      edgePixelCount: 0,
    }

    bin.l += color.l * weight
    bin.a += color.a * weight
    bin.b += color.b * weight
    bin.weight += weight
    bin.pixelCount += 1
    bin.saliencyTotal += saliency[index]
    bin.edgePixelCount += edges[index] > 0 ? 1 : 0
    bins.set(key, bin)
  }

  const rankedBins = Array.from(bins.values())
    .map((bin) => ({
      l: bin.l / bin.weight,
      a: bin.a / bin.weight,
      b: bin.b / bin.weight,
      weight: bin.weight,
      pixelCount: bin.pixelCount,
      saliencyMean: bin.saliencyTotal / bin.pixelCount,
      edgePixelCount: bin.edgePixelCount,
    }))
    .sort((left, right) => right.weight - left.weight || right.saliencyMean - left.saliencyMean || right.edgePixelCount - left.edgePixelCount || left.l - right.l || left.a - right.a || left.b - right.b)

  const selected = []
  for (const bin of rankedBins) {
    if (selected.length >= pipeline.size) {
      break
    }

    if (selected.every((color) => deltaE(color.lab, bin) >= pipeline.minimumDeltaE)) {
      const rgb = labToRgb(bin)
      selected.push({
        id: `palette-${String(selected.length + 1).padStart(3, '0')}`,
        hex: rgbToHex(rgb),
        rgb,
        lab: { l: round(bin.l), a: round(bin.a), b: round(bin.b) },
        weight: round(bin.weight),
        pixelCount: bin.pixelCount,
        saliencyMean: round(bin.saliencyMean / 255),
        edgePixelCount: bin.edgePixelCount,
      })
    }
  }

  for (const bin of rankedBins) {
    if (selected.length >= pipeline.size) {
      break
    }

    if (!selected.some((color) => color.lab.l === round(bin.l) && color.lab.a === round(bin.a) && color.lab.b === round(bin.b))) {
      const rgb = labToRgb(bin)
      selected.push({
        id: `palette-${String(selected.length + 1).padStart(3, '0')}`,
        hex: rgbToHex(rgb),
        rgb,
        lab: { l: round(bin.l), a: round(bin.a), b: round(bin.b) },
        weight: round(bin.weight),
        pixelCount: bin.pixelCount,
        saliencyMean: round(bin.saliencyTotal / bin.pixelCount / 255),
        edgePixelCount: bin.edgePixelCount,
      })
    }
  }

  return selected
}

const nearestPaletteColor = ({ l, a, b, palette }) => {
  let bestColor = palette[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const color of palette) {
    const distance = deltaE({ l, a, b }, color.lab)
    if (distance < bestDistance) {
      bestColor = color
      bestDistance = distance
    }
  }

  return { color: bestColor, distance: bestDistance }
}

const cellStats = ({ lab, luminance, saliency, edges, width, startX, startY, endX, endY, pipeline }) => {
  let lTotal = 0
  let aTotal = 0
  let bTotal = 0
  let saliencyTotal = 0
  let edgeCount = 0
  let luminanceTotal = 0
  let luminanceMin = 255
  let luminanceMax = 0
  let weightedX = 0
  let weightedY = 0
  let weightTotal = 0
  const pixelCount = (endX - startX) * (endY - startY)

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const pixel = y * width + x
      const offset = pixel * 3
      const edge = edges[pixel] > 0 ? 1 : 0
      const saliencyValue = saliency[pixel] / 255
      const anchorWeight = 1 + edge * 3 + saliencyValue * 2

      lTotal += lab[offset]
      aTotal += lab[offset + 1]
      bTotal += lab[offset + 2]
      saliencyTotal += saliencyValue
      edgeCount += edge
      luminanceTotal += luminance[pixel]
      luminanceMin = Math.min(luminanceMin, luminance[pixel])
      luminanceMax = Math.max(luminanceMax, luminance[pixel])
      weightedX += x * anchorWeight
      weightedY += y * anchorWeight
      weightTotal += anchorWeight
    }
  }

  const edgeDensity = edgeCount / pixelCount
  const saliencyMean = saliencyTotal / pixelCount
  const luminanceRange = (luminanceMax - luminanceMin) / 255
  const score = edgeDensity * pipeline.edgeWeight + saliencyMean * pipeline.saliencyWeight + luminanceRange * pipeline.contrastWeight

  return {
    lab: { l: lTotal / pixelCount, a: aTotal / pixelCount, b: bTotal / pixelCount },
    anchor: { x: Math.round(weightedX / weightTotal), y: Math.round(weightedY / weightTotal) },
    edgeDensity,
    edgePixelCount: edgeCount,
    saliencyMean,
    luminanceMean: luminanceTotal / pixelCount / 255,
    luminanceRange,
    score,
  }
}

const generateTileCandidates = ({ lab, luminance, saliency, edges, width, height, palette, pipeline }) => {
  const cellSize = Math.max(pipeline.minimumCellSize, Math.floor(Math.sqrt((width * height) / pipeline.count)))
  const candidates = []

  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      const endX = Math.min(width, x + cellSize)
      const endY = Math.min(height, y + cellSize)
      const stats = cellStats({ lab, luminance, saliency, edges, width, startX: x, startY: y, endX, endY, pipeline })
      if (stats.edgePixelCount === 0 && stats.saliencyMean < 0.05) {
        continue
      }

      const nearest = nearestPaletteColor({ ...stats.lab, palette })
      candidates.push({
        box: { x, y, width: endX - x, height: endY - y },
        anchor: stats.anchor,
        score: round(stats.score, 6),
        edgeDensity: round(stats.edgeDensity, 6),
        edgePixelCount: stats.edgePixelCount,
        saliencyMean: round(stats.saliencyMean, 6),
        luminanceMean: round(stats.luminanceMean, 6),
        luminanceRange: round(stats.luminanceRange, 6),
        paletteId: nearest.color.id,
        paletteHex: nearest.color.hex,
        paletteDeltaE: round(nearest.distance, 4),
      })
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || right.edgePixelCount - left.edgePixelCount || left.box.y - right.box.y || left.box.x - right.box.x)
    .slice(0, pipeline.count)
    .map((candidate, index) => ({
      id: `tile-candidate-${String(index + 1).padStart(5, '0')}`,
      ...candidate,
    }))
}

const writeArtifact = async ({ outputDir, fileName, value }) => {
  const buffer = Buffer.from(stableStringify(value), 'utf8')
  const artifactPath = path.join(outputDir, fileName)
  await writeFile(artifactPath, buffer)
  return {
    path: path.relative(process.cwd(), artifactPath),
    bytes: buffer.byteLength,
    sha256: sha256(buffer),
  }
}

export const generateMosaicInputs = async ({ preprocessingConfigPath, outputDir, pipeline = defaultPipeline }) => {
  await mkdir(outputDir, { recursive: true })

  const preprocessingConfig = await readJson(preprocessingConfigPath)
  const width = preprocessingConfig.output.width
  const height = preprocessingConfig.output.height
  const lab = await readLab({ preprocessingConfig })
  const luminance = await readMask({ artifactPath: preprocessingConfig.output.artifacts.luminance.path, width, height })
  const saliency = await readMask({ artifactPath: preprocessingConfig.output.artifacts.saliency.path, width, height })
  const edges = await readMask({ artifactPath: preprocessingConfig.output.artifacts.edges.path, width, height })

  assert.equal(lab.length, width * height * 3, 'LAB artifact dimensions must match preprocessing config')

  const palette = extractPalette({ lab, saliency, edges, pipeline: pipeline.palette })
  const candidates = generateTileCandidates({ lab, luminance, saliency, edges, width, height, palette, pipeline: pipeline.candidates })

  const paletteArtifact = await writeArtifact({
    outputDir,
    fileName: artifactNames.palette,
    value: {
      manifestVersion: 1,
      sourceImageId: preprocessingConfig.source.imageId,
      generatorSeed: pipeline.generatorSeed,
      colorSpace: preprocessingConfig.pipeline.colorSpace.working,
      palette,
    },
  })
  const candidatesArtifact = await writeArtifact({
    outputDir,
    fileName: artifactNames.candidates,
    value: {
      manifestVersion: 1,
      sourceImageId: preprocessingConfig.source.imageId,
      generatorSeed: pipeline.generatorSeed,
      coordinateSpace: {
        width,
        height,
        unit: 'preprocessed-source-pixel',
      },
      candidates,
    },
  })

  const config = {
    manifestVersion: 1,
    pipeline,
    source: {
      preprocessingConfigPath: path.relative(process.cwd(), preprocessingConfigPath),
      imageId: preprocessingConfig.source.imageId,
      preprocessingConfigSha256: sha256(await readFile(preprocessingConfigPath)),
    },
    output: {
      width,
      height,
      paletteSize: palette.length,
      candidateCount: candidates.length,
      artifacts: {
        palette: paletteArtifact,
        candidates: candidatesArtifact,
      },
    },
  }
  const configArtifact = await writeArtifact({ outputDir, fileName: artifactNames.config, value: config })

  return { ...config, configArtifact }
}

const runCli = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  assert.ok(Number.isInteger(args.paletteSize) && args.paletteSize > 0, '--palette-size must be a positive integer')
  assert.ok(Number.isInteger(args.candidateCount) && args.candidateCount > 0, '--candidate-count must be a positive integer')

  const pipeline = {
    ...defaultPipeline,
    palette: { ...defaultPipeline.palette, size: args.paletteSize },
    candidates: { ...defaultPipeline.candidates, count: args.candidateCount },
  }
  const config = await generateMosaicInputs({
    preprocessingConfigPath: path.resolve(args.input),
    outputDir: path.resolve(args.output),
    pipeline,
  })

  console.log(`Generated mosaic inputs for ${config.source.imageId}:`)
  console.log(`- palette: ${config.output.artifacts.palette.path} (${config.output.artifacts.palette.sha256})`)
  console.log(`- candidates: ${config.output.artifacts.candidates.path} (${config.output.artifacts.candidates.sha256})`)
  console.log(`- config: ${config.configArtifact.path} (${config.configArtifact.sha256})`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
