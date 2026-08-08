import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import {
  loadPatchDeliveryOperationsAfter,
  loadPatchDeliverySnapshot,
  loadQuiltDeliveryContext,
  isAgentAssignedPatch,
  loadAgentAssignedPatchIds,
  writeAgentReadAuthorizationAudit,
} from '../db/index.js'
import { ResourceNotFoundError } from '../db/repository.js'
import { getPrincipalContext, sendResourceNotFound, type AuthenticatedRequest } from '../auth/httpAuth.js'
import { annotateWorkerReadTelemetry, runWithWorkerReadTelemetry } from '../telemetry.js'

type AgentReadDependencies = {
  loadQuiltContext: typeof loadQuiltDeliveryContext
  loadPatchSnapshot: typeof loadPatchDeliverySnapshot
  loadPatchOperationsAfter: typeof loadPatchDeliveryOperationsAfter
  isAgentAssignedPatch: (principalId: string, patchId: string) => Promise<boolean>
  loadAssignedPatchIds: (principalId: string, quiltId: string) => Promise<string[]>
  writeAuthorizationAudit: typeof writeAgentReadAuthorizationAudit
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_REPLAY_LIMIT = 500
const DEFAULT_REPLAY_LIMIT = 200
const MAX_CONTEXT_PATCHES = 256
const MAX_RESPONSE_BYTES = 256 * 1024
const MAX_SNAPSHOT_TILES = 2_000

const parsePositiveInt = (value: string | undefined): number | null => {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

const parseReplayLimit = (value: string | undefined): number | null => {
  if (!value) {
    return DEFAULT_REPLAY_LIMIT
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_REPLAY_LIMIT) {
    return null
  }

  return parsed
}

const sendInvalidRequest = (response: Response): void => {
  response.status(400).json({
    code: 'invalid_request',
    message: 'The request payload is invalid.',
    requestId: response.getHeader('x-request-id')?.toString() ?? randomUUID(),
  })
}

const sendPayloadTooLarge = (response: Response): void => {
  response.status(413).json({
    code: 'payload_too_large',
    message: 'The requested worker payload exceeds the configured limit.',
    requestId: requestIdFrom(response),
  })
}

const responseExceedsByteLimit = (body: unknown): boolean =>
  Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_RESPONSE_BYTES

const sendBoundedJson = (response: Response, body: unknown): boolean => {
  if (responseExceedsByteLimit(body)) {
    sendPayloadTooLarge(response)
    return false
  }
  response.status(200).json(body)
  return true
}

const isSurface = (value: string | undefined): value is 'fineData' | 'aggregateData' =>
  value === undefined || value === 'fineData' || value === 'aggregateData'

const principalIdFrom = (request: Request): string =>
  getPrincipalContext(request as AuthenticatedRequest).principalId

const requestIdFrom = (response: Response): string =>
  response.getHeader('x-request-id')?.toString() ?? randomUUID()

const withNotFoundBoundary = async (
  response: Response,
  work: () => Promise<void>,
  onNotFound?: () => Promise<void>,
): Promise<void> => {
  try {
    await work()
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
      await onNotFound?.()
      annotateWorkerReadTelemetry({
        'agent.read.outcome': 'not_found',
      })
      sendResourceNotFound(response, requestIdFrom(response))
      return
    }

    throw error
  }
}

export const createAgentReadRouter = (
  dependencies: AgentReadDependencies = {
    loadQuiltContext: loadQuiltDeliveryContext,
    loadPatchSnapshot: loadPatchDeliverySnapshot,
    loadPatchOperationsAfter: loadPatchDeliveryOperationsAfter,
    isAgentAssignedPatch,
    loadAssignedPatchIds: loadAgentAssignedPatchIds,
    writeAuthorizationAudit: writeAgentReadAuthorizationAudit,
  },
): Router => {
  const router = Router()

  const audit = async (
    request: Request,
    response: Response,
    attemptedAction: 'read_quilt_context' | 'read_patch_snapshot' | 'read_patch_events',
    outcome: 'allowed' | 'denied',
    identifiers: { quiltId?: string; patchId?: string },
    reasonCode?: 'ASSIGNMENT_REQUIRED' | 'RESOURCE_NOT_FOUND' | 'PAYLOAD_TOO_LARGE',
  ): Promise<void> => dependencies.writeAuthorizationAudit({
    actorPrincipalId: principalIdFrom(request),
    attemptedAction,
    outcome,
    ...(reasonCode ? { reasonCode } : {}),
    ...identifiers,
    requestId: requestIdFrom(response),
  })

  router.get('/quilts/:quiltId/context', async (request, response) => {
    await runWithWorkerReadTelemetry('agent.read.quilt_context', {
      'agent.read.route': '/quilts/:quiltId/context',
    }, async () => {
      const quiltId = request.params.quiltId
      if (typeof quiltId !== 'string' || !UUID_PATTERN.test(quiltId)) {
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'invalid_request',
        })
        sendInvalidRequest(response)
        return
      }

      const assignedPatchIds = new Set(await dependencies.loadAssignedPatchIds(principalIdFrom(request), quiltId))
      if (assignedPatchIds.size === 0) {
        await audit(request, response, 'read_quilt_context', 'denied', { quiltId }, 'ASSIGNMENT_REQUIRED')
        sendResourceNotFound(response, requestIdFrom(response))
        return
      }

      const context = await dependencies.loadQuiltContext({
        quiltId,
        principalId: principalIdFrom(request),
      })

      if (!context) {
        await audit(request, response, 'read_quilt_context', 'denied', { quiltId }, 'RESOURCE_NOT_FOUND')
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'not_found',
          'agent.read.quilt_id': quiltId,
        })
        sendResourceNotFound(response, requestIdFrom(response))
        return
      }

      const assignedPatches = context.patches.filter((patch) => assignedPatchIds.has(patch.id))
      if (assignedPatches.length > MAX_CONTEXT_PATCHES) {
        await audit(request, response, 'read_quilt_context', 'denied', { quiltId }, 'PAYLOAD_TOO_LARGE')
        sendPayloadTooLarge(response)
        return
      }
      annotateWorkerReadTelemetry({
        'agent.read.outcome': 'ok',
        'agent.read.quilt_id': quiltId,
        'agent.read.patch_count': assignedPatches.length,
      })
      const body = { ...context, patches: assignedPatches }
      if (responseExceedsByteLimit(body)) {
        await audit(request, response, 'read_quilt_context', 'denied', { quiltId }, 'PAYLOAD_TOO_LARGE')
        sendPayloadTooLarge(response)
      } else {
        await audit(request, response, 'read_quilt_context', 'allowed', { quiltId })
        sendBoundedJson(response, body)
      }
    })
  })

  router.get('/patches/:patchId/snapshot', async (request, response, next) => {
    await runWithWorkerReadTelemetry('agent.read.patch_snapshot', {
      'agent.read.route': '/patches/:patchId/snapshot',
    }, async () => {
      const patchId = request.params.patchId
      if (typeof patchId !== 'string' || !UUID_PATTERN.test(patchId)) {
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'invalid_request',
        })
        sendInvalidRequest(response)
        return
      }

      const surface = typeof request.query.surface === 'string' ? request.query.surface : undefined
      if (!isSurface(surface)) {
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'invalid_request',
        })
        sendInvalidRequest(response)
        return
      }

      await withNotFoundBoundary(response, async () => {
        if (!await dependencies.isAgentAssignedPatch(principalIdFrom(request), patchId)) {
          await audit(request, response, 'read_patch_snapshot', 'denied', { patchId }, 'ASSIGNMENT_REQUIRED')
          sendResourceNotFound(response, requestIdFrom(response))
          return
        }
        const snapshot = await dependencies.loadPatchSnapshot(patchId, {
          principalId: principalIdFrom(request),
          ...(surface ? { surface } : {}),
        })
        if (snapshot.tiles.length > MAX_SNAPSHOT_TILES) {
          await audit(request, response, 'read_patch_snapshot', 'denied', { patchId }, 'PAYLOAD_TOO_LARGE')
          sendPayloadTooLarge(response)
          return
        }
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'ok',
          'agent.read.patch_id': patchId,
          ...(surface ? { 'agent.read.surface': surface } : {}),
        })
        if (responseExceedsByteLimit(snapshot)) {
          await audit(request, response, 'read_patch_snapshot', 'denied', { patchId }, 'PAYLOAD_TOO_LARGE')
          sendPayloadTooLarge(response)
        } else {
          await audit(request, response, 'read_patch_snapshot', 'allowed', { patchId })
          sendBoundedJson(response, snapshot)
        }
      }, () => audit(request, response, 'read_patch_snapshot', 'denied', { patchId }, 'RESOURCE_NOT_FOUND'))
    }).catch(next)
  })

  router.get('/patches/:patchId/events', async (request, response, next) => {
    await runWithWorkerReadTelemetry('agent.read.patch_events', {
      'agent.read.route': '/patches/:patchId/events',
    }, async () => {
      const patchId = request.params.patchId
      if (typeof patchId !== 'string' || !UUID_PATTERN.test(patchId)) {
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'invalid_request',
        })
        sendInvalidRequest(response)
        return
      }

      const afterOpSeq = parsePositiveInt(typeof request.query.afterOpSeq === 'string' ? request.query.afterOpSeq : undefined)
      const limit = parseReplayLimit(typeof request.query.limit === 'string' ? request.query.limit : undefined)

      if (afterOpSeq === null || limit === null) {
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'invalid_request',
        })
        sendInvalidRequest(response)
        return
      }

      await withNotFoundBoundary(response, async () => {
        if (!await dependencies.isAgentAssignedPatch(principalIdFrom(request), patchId)) {
          await audit(request, response, 'read_patch_events', 'denied', { patchId }, 'ASSIGNMENT_REQUIRED')
          sendResourceNotFound(response, requestIdFrom(response))
          return
        }
        const operations = await dependencies.loadPatchOperationsAfter(
          patchId,
          afterOpSeq,
          principalIdFrom(request),
          limit,
        )
        const boundedOperations = operations.slice(0, limit)
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'ok',
          'agent.read.patch_id': patchId,
          'agent.read.after_op_seq': afterOpSeq,
          'agent.read.limit': limit,
          'agent.read.operation_count': boundedOperations.length,
        })
        const body = { operations: boundedOperations }
        if (responseExceedsByteLimit(body)) {
          await audit(request, response, 'read_patch_events', 'denied', { patchId }, 'PAYLOAD_TOO_LARGE')
          sendPayloadTooLarge(response)
        } else {
          await audit(request, response, 'read_patch_events', 'allowed', { patchId })
          sendBoundedJson(response, body)
        }
      }, () => audit(request, response, 'read_patch_events', 'denied', { patchId }, 'RESOURCE_NOT_FOUND'))
    }).catch(next)
  })

  return router
}
