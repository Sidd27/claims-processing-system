export type DisputeStatus = 'open' | 'resolved'
export type DisputeResolution = 'upheld' | 'overturned'

export interface Dispute {
  id: string
  lineItemId: string
  memberReason: string
  status: DisputeStatus
  resolution: DisputeResolution | null
  resolverNote: string | null
  resolvedAt: string | null
  createdAt: string
}
