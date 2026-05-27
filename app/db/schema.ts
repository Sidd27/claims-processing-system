import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, date } from 'drizzle-orm/pg-core';

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  planCode: text('plan_code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const planCoverageRules = pgTable('plan_coverage_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  serviceType: text('service_type').notNull(),
  ruleType: text('rule_type').notNull(),
  config: jsonb('config').notNull(),
});

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalMemberId: text('external_member_id').notNull().unique(),
  name: text('name').notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id),
  planId: uuid('plan_id').references(() => plans.id),
  planName: text('plan_name').notNull(),
  effectiveDate: date('effective_date').notNull(),
  termDate: date('term_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const coverageRules = pgTable('coverage_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id')
    .notNull()
    .references(() => policies.id),
  serviceType: text('service_type').notNull(),
  ruleType: text('rule_type').notNull(),
  config: jsonb('config').notNull(),
});

export const claims = pgTable('claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .references(() => members.id),
  policyId: uuid('policy_id')
    .notNull()
    .references(() => policies.id),
  providerName: text('provider_name').notNull(),
  providerNpi: text('provider_npi').notNull(),
  diagnosisCode: text('diagnosis_code').notNull(),
  status: text('status').notNull().default('submitted'),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
});

export const claimLineItems = pgTable('claim_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  claimId: uuid('claim_id')
    .notNull()
    .references(() => claims.id),
  serviceType: text('service_type').notNull(),
  cptCode: text('cpt_code').notNull(),
  description: text('description').notNull(),
  serviceDate: date('service_date').notNull(),
  billedAmount: integer('billed_amount').notNull(),
  status: text('status').notNull().default('pending'),
});

export const adjudicationResults = pgTable('adjudication_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  lineItemId: uuid('line_item_id')
    .notNull()
    .references(() => claimLineItems.id),
  approvedAmount: integer('approved_amount').notNull(),
  deductibleAppliedAmount: integer('deductible_applied_amount').notNull().default(0),
  reductionReasons: jsonb('reduction_reasons').notNull().default([]),
  explanationSteps: jsonb('explanation_steps').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  trigger: text('trigger').notNull(),
  adjudicatedAt: timestamp('adjudicated_at').notNull().defaultNow(),
});

export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  lineItemId: uuid('line_item_id')
    .notNull()
    .references(() => claimLineItems.id),
  memberReason: text('member_reason').notNull(),
  status: text('status').notNull().default('open'),
  resolution: text('resolution'),
  resolverNote: text('resolver_note'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
