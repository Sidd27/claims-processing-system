import { eq } from 'drizzle-orm';
import { db } from '../client';
import { disputes } from '../schema';
import type { Dispute, DisputeStatus, DisputeResolution } from '../../domain/disputes/types';

type DbClient = typeof db;

export async function createDispute(
  lineItemId: string,
  memberReason: string,
  dbClient: DbClient = db
): Promise<Dispute> {
  const result = await dbClient.insert(disputes).values({ lineItemId, memberReason }).returning();
  return mapToDispute(result[0]);
}

export async function getDispute(
  disputeId: string,
  dbClient: DbClient = db
): Promise<Dispute | null> {
  const result = await dbClient.select().from(disputes).where(eq(disputes.id, disputeId));
  const row = result[0];
  if (!row) return null;
  return mapToDispute(row);
}

export async function getDisputesByLineItemId(
  lineItemId: string,
  dbClient: DbClient = db
): Promise<Dispute[]> {
  const rows = await dbClient.select().from(disputes).where(eq(disputes.lineItemId, lineItemId));
  return rows.map(mapToDispute);
}

export async function markDisputeResolved(
  disputeId: string,
  resolution: DisputeResolution,
  resolverNote: string,
  dbClient: DbClient = db
): Promise<void> {
  await dbClient
    .update(disputes)
    .set({
      status: 'resolved',
      resolution,
      resolverNote,
      resolvedAt: new Date(),
    })
    .where(eq(disputes.id, disputeId));
}

function mapToDispute(row: typeof disputes.$inferSelect): Dispute {
  return {
    id: row.id,
    lineItemId: row.lineItemId,
    memberReason: row.memberReason,
    status: row.status as DisputeStatus,
    resolution: row.resolution as DisputeResolution | null,
    resolverNote: row.resolverNote,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
