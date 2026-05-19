import { eq } from 'drizzle-orm';
import { db } from '../client';
import { claimLineItems } from '../schema';
import type { LineItemStatus, ClaimLineItem } from '../../domain/claims/types';
import type { ServiceType } from '../../domain/policies/types';

type DbClient = typeof db;

export interface CreateLineItemInput {
  claimId: string;
  serviceType: string;
  cptCode: string;
  description: string;
  serviceDate: string;
  billedAmount: number;
}

export async function getLineItem(lineItemId: string, dbClient: DbClient = db): Promise<ClaimLineItem | null> {
  const result = await dbClient.select().from(claimLineItems).where(eq(claimLineItems.id, lineItemId));
  const row = result[0];
  if (!row) return null;
  return mapToLineItem(row);
}

export async function getLineItemsByClaimId(claimId: string, dbClient: DbClient = db): Promise<ClaimLineItem[]> {
  const rows = await dbClient.select().from(claimLineItems).where(eq(claimLineItems.claimId, claimId));
  return rows.map(mapToLineItem);
}

export async function createLineItems(inputs: CreateLineItemInput[], dbClient: DbClient = db) {
  return dbClient.insert(claimLineItems).values(inputs).returning();
}

export async function updateLineItemStatus(lineItemId: string, status: LineItemStatus, dbClient: DbClient = db) {
  await dbClient.update(claimLineItems).set({ status }).where(eq(claimLineItems.id, lineItemId));
}

function mapToLineItem(row: typeof claimLineItems.$inferSelect): ClaimLineItem {
  return {
    id: row.id,
    claimId: row.claimId,
    serviceType: row.serviceType as ServiceType,
    cptCode: row.cptCode,
    description: row.description,
    serviceDate: row.serviceDate,
    billedAmount: row.billedAmount,
    status: row.status as LineItemStatus,
  };
}
