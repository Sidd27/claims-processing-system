import { eq } from 'drizzle-orm'
import { db } from '../client'
import { adjudicationResults } from '../schema'
import type { ReductionReason, ExplanationStep } from '../../domain/adjudication/types'

type DbClient = typeof db

export interface CreateAdjudicationResultInput {
  lineItemId: string
  approvedAmountCents: number
  deductibleAppliedCents: number
  reductionReasons: ReductionReason[]
  explanationSteps: ExplanationStep[]
  trigger: string
}

export async function createAdjudicationResult(input: CreateAdjudicationResultInput, dbClient: DbClient = db) {
  const result = await dbClient.insert(adjudicationResults).values(input).returning()
  return result[0]
}

export async function deactivateResults(lineItemId: string, dbClient: DbClient = db) {
  await dbClient
    .update(adjudicationResults)
    .set({ isActive: false })
    .where(eq(adjudicationResults.lineItemId, lineItemId))
}

export async function getActiveResult(lineItemId: string, dbClient: DbClient = db) {
  const result = await dbClient
    .select()
    .from(adjudicationResults)
    .where(eq(adjudicationResults.lineItemId, lineItemId))
  return result.find(r => r.isActive) ?? null
}

export async function getResultHistory(lineItemId: string, dbClient: DbClient = db) {
  return dbClient
    .select()
    .from(adjudicationResults)
    .where(eq(adjudicationResults.lineItemId, lineItemId))
    .orderBy(adjudicationResults.adjudicatedAt)
}
