import { eq, and, sql } from 'drizzle-orm'
import { db } from '../client'
import { adjudicationResults, claimLineItems, claims } from '../schema'
import type { PriorUsage } from '../../domain/adjudication/types'
import type { ServiceType } from '../../domain/policies/types'

type DbClient = typeof db

export async function computePriorUsage(
  memberId: string,
  serviceType: ServiceType,
  year: number,
  dbClient: DbClient = db
): Promise<PriorUsage> {
  const rows = await dbClient
    .select({
      approvedAmountCents: adjudicationResults.approvedAmountCents,
      deductibleAppliedCents: adjudicationResults.deductibleAppliedCents
    })
    .from(adjudicationResults)
    .innerJoin(claimLineItems, eq(adjudicationResults.lineItemId, claimLineItems.id))
    .innerJoin(claims, eq(claimLineItems.claimId, claims.id))
    .where(
      and(
        eq(adjudicationResults.isActive, true),
        eq(claimLineItems.serviceType, serviceType),
        eq(claims.memberId, memberId),
        sql`EXTRACT(YEAR FROM ${adjudicationResults.adjudicatedAt}) = ${year}`
      )
    )

  return rows.reduce<PriorUsage>(
    (acc, row) => ({
      annualUsageCents: acc.annualUsageCents + row.approvedAmountCents,
      deductiblePaidCents: acc.deductiblePaidCents + row.deductibleAppliedCents
    }),
    { annualUsageCents: 0, deductiblePaidCents: 0 }
  )
}
