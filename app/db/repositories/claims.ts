import { eq, desc } from 'drizzle-orm'
import { db } from '../client'
import { claims } from '../schema'
import type { ClaimStatus } from '../../domain/claims/types'

type DbClient = typeof db

export interface CreateClaimInput {
  memberId: string
  policyId: string
  providerName: string
  providerNpi: string
  diagnosisCode: string
}

export async function getClaim(claimId: string, dbClient: DbClient = db) {
  const result = await dbClient.select().from(claims).where(eq(claims.id, claimId))
  return result[0] ?? null
}

export async function listClaims(dbClient: DbClient = db) {
  return dbClient.select().from(claims).orderBy(desc(claims.submittedAt))
}

export async function createClaim(input: CreateClaimInput, dbClient: DbClient = db) {
  const result = await dbClient.insert(claims).values(input).returning()
  return result[0]
}

export async function updateClaimStatus(claimId: string, status: ClaimStatus, dbClient: DbClient = db) {
  await dbClient.update(claims).set({ status }).where(eq(claims.id, claimId))
}
