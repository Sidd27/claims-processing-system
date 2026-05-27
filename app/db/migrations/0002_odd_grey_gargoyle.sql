CREATE TABLE IF NOT EXISTS "plan_coverage_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"rule_type" text NOT NULL,
	"config" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_plan_code_unique" UNIQUE("plan_code")
);
--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "plan_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_coverage_rules" ADD CONSTRAINT "plan_coverage_rules_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policies" ADD CONSTRAINT "policies_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
