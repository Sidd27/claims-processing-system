import type { ClaimStatus } from './claims/types';

export const DISPUTABLE_STATES: ClaimStatus[] = ['partially_approved', 'denied'];
export const PAYABLE_STATES: ClaimStatus[] = ['approved', 'partially_approved'];
