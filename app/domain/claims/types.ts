import type { ServiceType } from '../policies/types';

export const CLAIM_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'partially_approved',
  'denied',
  'paid',
  'disputed',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const LINE_ITEM_STATUSES = ['pending', 'covered', 'partially_covered', 'denied', 'needs_review'] as const;
export type LineItemStatus = (typeof LINE_ITEM_STATUSES)[number];

export interface Claim {
  id: string;
  memberId: string;
  policyId: string;
  providerName: string;
  providerNpi: string;
  diagnosisCode: string;
  status: ClaimStatus;
  submittedAt: string;
}

export interface ClaimLineItem {
  id: string;
  claimId: string;
  serviceType: ServiceType;
  cptCode: string;
  description: string;
  serviceDate: string;
  billedAmount: number;
  status: LineItemStatus;
}
