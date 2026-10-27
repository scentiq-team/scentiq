CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"request_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_logs_actor_type_valid" CHECK ("audit_logs"."actor_type" in ('system', 'staff', 'guest')),
	CONSTRAINT "audit_logs_staff_has_actor" CHECK (("audit_logs"."actor_type" = 'staff') = ("audit_logs"."actor_id" is not null)),
	CONSTRAINT "audit_logs_action_format" CHECK ("audit_logs"."action" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' and length("audit_logs"."action") <= 100),
	CONSTRAINT "audit_logs_entity_pair" CHECK (("audit_logs"."entity_type" is null) = ("audit_logs"."entity_id" is null)),
	CONSTRAINT "audit_logs_details_object" CHECK (jsonb_typeof("audit_logs"."details") = 'object'),
	CONSTRAINT "audit_logs_details_size" CHECK (octet_length("audit_logs"."details"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "sample_data_registry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"seed_batch" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sample_data_registry_table_name_format" CHECK ("sample_data_registry"."table_name" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sample_data_registry_row_uq" ON "sample_data_registry" USING btree ("table_name","row_id");