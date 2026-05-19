import { eq, and, sql } from 'drizzle-orm';
import { db } from '../client';
import { adjudicationResults, claimLineItems, claims } from '../schema';
import type { PriorUsage } from '../../domain/adjudication/types';
import type { ServiceType } from '../../domain/policies/types';

type DbClient = typeof db;

export async function computePriorUsage(
  memberId: string,
  serviceType: ServiceType,
  year: number,
  dbClient: DbClient = db
): Promise<PriorUsage> {
  const rows = await dbClient
    .select({
      approvedAmount: adjudicationResults.approvedAmount,
      deductibleAppliedAmount: adjudicationResults.deductibleAppliedAmount,
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
    );

  return rows.reduce<PriorUsage>(
    (acc, row) => ({
      annualUsageAmount: acc.annualUsageAmount + row.approvedAmount,
      deductiblePaidAmount: acc.deductiblePaidAmount + row.deductibleAppliedAmount,
    }),
    { annualUsageAmount: 0, deductiblePaidAmount: 0 }
  );
}
