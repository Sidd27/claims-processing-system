import { eq } from 'drizzle-orm'
import { db } from '../client'
import { members, policies } from '../schema'

type DbClient = typeof db

export async function listMembers(dbClient: DbClient = db) {
  return dbClient.select().from(members).orderBy(members.name)
}

export async function getMember(memberId: string, dbClient: DbClient = db) {
  const result = await dbClient.select().from(members).where(eq(members.id, memberId))
  return result[0] ?? null
}

export async function getMemberWithPolicy(memberId: string, dbClient: DbClient = db) {
  const result = await dbClient
    .select()
    .from(members)
    .leftJoin(policies, eq(policies.memberId, members.id))
    .where(eq(members.id, memberId))
  return result[0] ?? null
}
