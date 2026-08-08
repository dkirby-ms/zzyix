import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import {
  loadPatchDeliveryOperationsAfter,
  loadPatchDeliverySnapshot,
  loadQuiltDeliveryContext,
} from '../db/index.js'
import { ResourceNotFoundError } from '../db/repository.js'
import { getPrincipalContext, sendResourceNotFound, type AuthenticatedRequest } from '../auth/httpAuth.js'
import { annotateWorkerReadTelemetry, runWithWorkerReadTelemetry } from '../telemetry.js'

type AgentReadDependencies = {
  loadQuiltContext: typeof loadQuiltDeliveryContext
  loadPatchSnapshot: typeof loadPatchDeliverySnapshot
  loadPatchOperationsAfter: typeof loadPatchDeliveryOperationsAfter
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_REPLAY_LIMIT = 500
const DEFAULT_REPLAY_LIMIT = 200

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

const isSurface = (value: string | undefined): value is 'fineData' | 'aggregateData' =>
  value === undefined || value === 'fineData' || value === 'aggregateData'

const principalIdFrom = (request: Request): string =>
  getPrincipalContext(request as AuthenticatedRequest).principalId

const requestIdFrom = (response: Response): string =>
  response.getHeader('x-request-id')?.toString() ?? randomUUID()

const withNotFoundBoundary = async (response: Response, work: () => Promise<void>): Promise<void> => {
  try {
    await work()
  } catch (error) {
    if (error instanceof ResourceNotFoundError) {
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
  },
): Router => {
  const router = Router()

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

      const context = await dependencies.loadQuiltContext({
        quiltId,
        principalId: principalIdFrom(request),
      })

      if (!context) {
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'not_found',
          'agent.read.quilt_id': quiltId,
        })
        sendResourceNotFound(response, requestIdFrom(response))
        return
      }

      annotateWorkerReadTelemetry({
        'agent.read.outcome': 'ok',
        'agent.read.quilt_id': quiltId,
        'agent.read.patch_count': context.patches.length,
      })
      response.status(200).json(context)
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
        const snapshot = await dependencies.loadPatchSnapshot(patchId, {
          principalId: principalIdFrom(request),
          ...(surface ? { surface } : {}),
        })
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'ok',
          'agent.read.patch_id': patchId,
          ...(surface ? { 'agent.read.surface': surface } : {}),
        })
        response.status(200).json(snapshot)
      })
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
        const operations = await dependencies.loadPatchOperationsAfter(
          patchId,
          afterOpSeq,
          principalIdFrom(request),
        )
        const boundedOperations = operations.slice(0, limit)
        annotateWorkerReadTelemetry({
          'agent.read.outcome': 'ok',
          'agent.read.patch_id': patchId,
          'agent.read.after_op_seq': afterOpSeq,
          'agent.read.limit': limit,
          'agent.read.operation_count': boundedOperations.length,
        })
        response.status(200).json({
          operations: boundedOperations,
        })
      })
    }).catch(next)
  })

  return router
}
