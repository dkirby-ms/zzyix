import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { externalPrincipalMappings, principals } from '../db/schema.js'
import { getDatabaseBundle } from '../db/client.js'
import type { PrincipalStatusValue } from '../db/types.js'
import { AuthenticationError } from './errors.js'
import type { VerifiedExternalIdentity } from './tokenVerifier.js'

export type PrincipalContext = {
  principalId: string
  status: 'active'
  tokenExpiresAt: Date
}

type PersistedPrincipal = {
  principalId: string
  status: PrincipalStatusValue
}

const assertActive = (
  principal: PersistedPrincipal,
  identity: VerifiedExternalIdentity,
): PrincipalContext => {
  if (principal.status !== 'active') {
    throw new AuthenticationError('principal_inactive')
  }
  return {
    principalId: principal.principalId,
    status: principal.status,
    tokenExpiresAt: identity.expiresAt,
  }
}

export const resolveOrProvisionPrincipal = async (
  identity: VerifiedExternalIdentity,
): Promise<PrincipalContext> => {
  const { db } = getDatabaseBundle()

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identity.issuer}), hashtext(${identity.subject}))`)

    const [existing] = await tx
      .select({
        principalId: principals.id,
        status: principals.status,
      })
      .from(externalPrincipalMappings)
      .innerJoin(principals, eq(externalPrincipalMappings.principalId, principals.id))
      .where(and(
        eq(externalPrincipalMappings.providerNamespace, identity.issuer),
        eq(externalPrincipalMappings.externalSubject, identity.subject),
      ))
      .limit(1)

    if (existing) {
      const context = assertActive(existing as PersistedPrincipal, identity)
      await tx
        .update(principals)
        .set({
          displayName: identity.displayName ?? null,
          email: identity.email ?? null,
          updatedAt: new Date(),
        })
        .where(eq(principals.id, context.principalId))
      return context
    }

    const principalId = randomUUID()
    const [created] = await tx
      .insert(principals)
      .values({
        id: principalId,
        kind: 'human',
        displayName: identity.displayName,
        email: identity.email,
      })
      .returning({ principalId: principals.id, status: principals.status })

    if (!created) {
      throw new Error('Principal provisioning did not return the created principal')
    }

    await tx.insert(externalPrincipalMappings).values({
      providerNamespace: identity.issuer,
      externalSubject: identity.subject,
      principalId,
    })

    return assertActive(created as PersistedPrincipal, identity)
  })
}

export const resolveDeletionPendingPrincipal = async (
  identity: VerifiedExternalIdentity,
): Promise<PrincipalContext> => {
  const { db } = getDatabaseBundle()
  const [principal] = await db
    .select({ principalId: principals.id, status: principals.status })
    .from(externalPrincipalMappings)
    .innerJoin(principals, eq(externalPrincipalMappings.principalId, principals.id))
    .where(and(
      eq(externalPrincipalMappings.providerNamespace, identity.issuer),
      eq(externalPrincipalMappings.externalSubject, identity.subject),
      eq(principals.status, 'deletion_pending'),
    ))
    .limit(1)
  if (!principal) {
    throw new AuthenticationError('principal_inactive')
  }
  return {
    principalId: principal.principalId,
    status: 'active',
    tokenExpiresAt: identity.expiresAt,
  }
}

export const resolveAgentPrincipal = async (
  identity: VerifiedExternalIdentity,
): Promise<PrincipalContext> => {
  if (identity.kind !== 'app_agent') {
    throw new AuthenticationError('invalid_token')
  }

  const { db } = getDatabaseBundle()
  const [principal] = await db
    .select({ principalId: principals.id, status: principals.status, kind: principals.kind })
    .from(externalPrincipalMappings)
    .innerJoin(principals, eq(externalPrincipalMappings.principalId, principals.id))
    .where(and(
      eq(externalPrincipalMappings.providerNamespace, identity.issuer),
      eq(externalPrincipalMappings.externalSubject, identity.subject),
    ))
    .limit(1)

  if (!principal || principal.kind !== 'agent' || principal.status !== 'active') {
    throw new AuthenticationError('principal_inactive')
  }

  return {
    principalId: principal.principalId,
    status: 'active',
    tokenExpiresAt: identity.expiresAt,
  }
}