import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	ALEXANDER_DEPLOYMENT_REQUIREMENTS,
	ALEXANDER_V1_DEFAULTS,
	assertSupportedPlacement,
} from './alexander-placement-contract.mjs'

export * from './alexander-placement-contract.mjs'

const defaultInputConfigUrl = new URL('../offline/output/alexander-mosaic-inputs/alexander-mosaic-inputs-config.json', import.meta.url)
const defaultPreprocessingConfigUrl = new URL('../offline/output/alexander-preprocessed/alexander-preprocessing-config.json', import.meta.url)
const defaultOutputUrl = new URL('../offline/output/alexander-mosaic-inputs/', import.meta.url)

const MANIFEST_VERSION = 2
const GENERATOR_VERSION = 'alexander-patch-manifest-v2'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const hashFile = async (filePath) => sha256(await readFile(filePath))
const stableStringify = (value) => `${JSON.stringify(sortObject(value), null, 2)}\n`
const canonicalStringify = (value) => JSON.stringify(sortObject(value))
const sortObject = (value) => {
	if (Array.isArray(value)) return value.map(sortObject)
	if (value && typeof value === 'object' && value.constructor === Object) {
		return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]))
	}
	return value
}
const resolvePath = (value) => path.resolve(process.cwd(), value)
const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'))
const artifactRecord = async (filePath) => {
	const buffer = await readFile(filePath)
	return { path: path.relative(process.cwd(), filePath), bytes: buffer.byteLength, sha256: sha256(buffer) }
}
const assertHash = async (filePath, expected, label) => {
	const actual = await hashFile(filePath)
	assert.equal(actual, expected, `${label} hash mismatch`)
	return actual
}

export const manifestContentHash = (manifest) => {
	const copy = JSON.parse(JSON.stringify(manifest))
	if (copy.provenance) {
		delete copy.provenance.manifestSha256
		delete copy.provenance.manifestBytes
	}
	return sha256(canonicalStringify(copy))
}

const sourceFeatureCoverage = ({ candidate, features }) => features
	.filter((feature) => candidate.box.x < feature.box.x + feature.box.width
		&& candidate.box.x + candidate.box.width > feature.box.x
		&& candidate.box.y < feature.box.y + feature.box.height
		&& candidate.box.y + candidate.box.height > feature.box.y)
	.map((feature) => feature.target)

export const generatePatchManifest = async ({
	mosaicInputsConfigPath,
	preprocessingConfigPath,
	outputPath,
	candidateBudget,
	placementBudget,
	conflictPolicy = ALEXANDER_V1_DEFAULTS.conflictPolicy,
	geometry = ALEXANDER_V1_DEFAULTS.geometry,
}) => {
	assert.equal(conflictPolicy, 'skip-and-record', 'only deterministic skip-and-record is supported')
	assert.deepEqual(geometry, ALEXANDER_V1_DEFAULTS.geometry, 'v1 geometry must remain square ceramic with zero rotation')

	const inputConfigPath = resolvePath(mosaicInputsConfigPath)
	const preprocessingConfigFilePath = resolvePath(preprocessingConfigPath)
	const inputConfig = await readJson(inputConfigPath)
	const preprocessingConfig = await readJson(preprocessingConfigFilePath)
	const inputConfigArtifact = await artifactRecord(inputConfigPath)
	const preprocessingConfigArtifact = await artifactRecord(preprocessingConfigFilePath)
	assert.equal(inputConfig.source.preprocessingConfigSha256, preprocessingConfigArtifact.sha256, 'preprocessing config hash mismatch')

	const sourceDimensions = { width: inputConfig.output.width, height: inputConfig.output.height }
	assert.deepEqual(sourceDimensions, { width: preprocessingConfig.output.width, height: preprocessingConfig.output.height }, 'source dimensions must match preprocessing config')
	const palettePath = resolvePath(inputConfig.output.artifacts.palette.path)
	const candidatesPath = resolvePath(inputConfig.output.artifacts.candidates.path)
	const paletteArtifact = await artifactRecord(palettePath)
	const candidatesArtifact = await artifactRecord(candidatesPath)
	await assertHash(palettePath, inputConfig.output.artifacts.palette.sha256, 'palette')
	await assertHash(candidatesPath, inputConfig.output.artifacts.candidates.sha256, 'candidates')
	const paletteDocument = await readJson(palettePath)
	const candidatesDocument = await readJson(candidatesPath)
	assert.equal(paletteDocument.palette.length, inputConfig.output.paletteSize, 'palette count mismatch')
	assert.equal(candidatesDocument.candidates.length, inputConfig.output.candidateCount, 'candidate count mismatch')
	assert.deepEqual({ width: candidatesDocument.coordinateSpace.width, height: candidatesDocument.coordinateSpace.height }, sourceDimensions, 'candidate coordinate space mismatch')

	const features = preprocessingConfig.output.featureCoverage ?? []
	const maxCandidates = candidateBudget ?? inputConfig.output.candidateCount
	const maxPlacements = placementBudget ?? maxCandidates
	assert.ok(Number.isInteger(maxCandidates) && maxCandidates >= 0, 'candidateBudget must be a non-negative integer')
	assert.ok(Number.isInteger(maxPlacements) && maxPlacements >= 0, 'placementBudget must be a non-negative integer')

	const orderedCandidates = [...candidatesDocument.candidates].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
	const seenIds = new Set()
	const placements = []
	const skippedCandidates = []
	const featureTargets = new Set()

	orderedCandidates.forEach((candidate, index) => {
		const skip = (reason, details = {}) => skippedCandidates.push({ candidateId: candidate.id, rank: index + 1, reason, ...details })
		if (seenIds.has(candidate.id)) return skip('duplicate-candidate-id')
		seenIds.add(candidate.id)
		if (index >= maxCandidates) return skip('candidate-budget-exceeded')
		if (placements.length >= maxPlacements) return skip('placement-budget-exceeded')
		const palette = paletteDocument.palette.find((entry) => entry.id === candidate.paletteId)
		if (!palette) return skip('missing-palette-reference')
		const coveredFeatures = sourceFeatureCoverage({ candidate, features })
		coveredFeatures.forEach((feature) => featureTargets.add(feature))
		placements.push({
			id: `alexander-tile-${String(placements.length + 1).padStart(5, '0')}`,
			source: { candidateId: candidate.id, rank: index + 1, anchor: candidate.anchor, normalizedAnchor: { x: candidate.anchor.x / sourceDimensions.width, y: candidate.anchor.y / sourceDimensions.height }, box: candidate.box, score: candidate.score, paletteId: candidate.paletteId, paletteDeltaE: candidate.paletteDeltaE, featureTargets: coveredFeatures },
			tile: { shape: geometry.shape, material: geometry.material, color: palette.hex, rotation: geometry.rotation, mirrored: geometry.mirrored },
		})
	})

	placements.forEach((placement) => assertSupportedPlacement({ ...placement.tile, position: { x: 0, y: 0 } }))
	const manifest = {
		schemaVersion: MANIFEST_VERSION,
		generator: { name: GENERATOR_VERSION, seed: inputConfig.pipeline.generatorSeed, command: 'npm run generate:alexander-patch-manifest' },
		source: { imageId: preprocessingConfig.source.imageId, sourceSha256: preprocessingConfig.source.sha256, dimensions: sourceDimensions, coordinateUnit: candidatesDocument.coordinateSpace.unit, featureRegions: features, preprocessingConfig: preprocessingConfigArtifact, normalizedArtifact: await artifactRecord(resolvePath(preprocessingConfig.output.artifacts.normalized.path)) },
		inputs: { config: inputConfigArtifact, palette: paletteArtifact, candidates: candidatesArtifact },
		coordinateSpace: 'source-local-normalized-x-y',
		geometry: { ...geometry, footprintUnit: 0.88 },
		budget: { candidateCount: candidatesDocument.candidates.length, candidateBudget: maxCandidates, placementBudget: maxPlacements, accepted: placements.length, skipped: skippedCandidates.length },
		policy: { conflict: conflictPolicy, outOfBounds: conflictPolicy, ordering: 'score-descending-then-candidate-id-ascending' },
		featureCoverage: { available: features.map((feature) => feature.target), selected: [...featureTargets].sort(), skipped: features.map((feature) => feature.target).filter((targetName) => !featureTargets.has(targetName)) },
		skippedCandidates,
		placements,
	}
	const manifestPath = resolvePath(outputPath)
	manifest.provenance = { manifestSha256: '', manifestBytes: 0, requiredDeploymentFields: ALEXANDER_DEPLOYMENT_REQUIREMENTS }
	manifest.provenance.manifestSha256 = manifestContentHash(manifest)
	let finalSerialized = stableStringify(manifest)
	let manifestBytes = Buffer.byteLength(finalSerialized)
	while (manifest.provenance.manifestBytes !== manifestBytes) {
		manifest.provenance.manifestBytes = manifestBytes
		finalSerialized = stableStringify(manifest)
		manifestBytes = Buffer.byteLength(finalSerialized)
	}
	const finalArtifact = { path: path.relative(process.cwd(), manifestPath), bytes: Buffer.byteLength(finalSerialized), sha256: sha256(finalSerialized) }
	await mkdir(path.dirname(manifestPath), { recursive: true })
	await writeFile(manifestPath, finalSerialized)
	return { ...manifest, artifact: finalArtifact }
}

const parseArgs = (argv) => {
	const args = { input: fileURLToPath(defaultInputConfigUrl), preprocessing: fileURLToPath(defaultPreprocessingConfigUrl), output: path.join(fileURLToPath(defaultOutputUrl), 'alexander-patch-manifest.json') }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--input') args.input = argv[++index]
		else if (arg === '--preprocessing') args.preprocessing = argv[++index]
		else if (arg === '--output') args.output = argv[++index]
		else if (arg === '--candidate-budget') args.candidateBudget = Number.parseInt(argv[++index], 10)
		else if (arg === '--placement-budget') args.placementBudget = Number.parseInt(argv[++index], 10)
		else if (arg === '--help' || arg === '-h') args.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return args
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const args = parseArgs(process.argv.slice(2))
	if (args.help) console.log('Usage: node scripts/generate-alexander-patch-manifest.mjs [--input path] [--preprocessing path] [--output path] [--candidate-budget n] [--placement-budget n]')
	else {
		const result = await generatePatchManifest({ mosaicInputsConfigPath: args.input, preprocessingConfigPath: args.preprocessing, outputPath: args.output, candidateBudget: args.candidateBudget, placementBudget: args.placementBudget })
		console.log(`Generated ${result.placements.length} placements and ${result.skippedCandidates.length} skips (${result.artifact.sha256}).`)
	}
}