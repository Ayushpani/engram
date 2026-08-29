-- Phase 1 initial schema for Supabase Postgres.
-- Run this once against your Supabase project's direct connection
-- (5432, not the 6543 pooler). Everything below is idempotent-safe
-- so re-runs during development don't error.

CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "tenants" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"hashed_key" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"revoked_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hashed_key_idx" ON "api_keys"("hashed_key");
CREATE INDEX IF NOT EXISTS "api_keys_tenant_idx" ON "api_keys"("tenant_id");

CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"user_id" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"last_seen_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "sessions_tenant_idx" ON "sessions"("tenant_id");

CREATE TABLE IF NOT EXISTS "memories" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"user_id" text,
	"session_id" text,
	"text" text NOT NULL,
	"kind" text NOT NULL DEFAULT 'fact',
	"source" text NOT NULL DEFAULT 'text',
	"embedding" vector(1536),
	"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "memories_tenant_idx" ON "memories"("tenant_id");
CREATE INDEX IF NOT EXISTS "memories_session_idx" ON "memories"("session_id");
CREATE INDEX IF NOT EXISTS "memories_user_idx" ON "memories"("user_id");
CREATE INDEX IF NOT EXISTS "memories_embedding_hnsw"
	ON "memories" USING hnsw ("embedding" vector_cosine_ops)
	WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS "entities" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "entities_tenant_name_idx" ON "entities"("tenant_id","name");

CREATE TABLE IF NOT EXISTS "relations" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"from_entity_id" text NOT NULL REFERENCES "entities"("id") ON DELETE CASCADE,
	"to_entity_id" text NOT NULL REFERENCES "entities"("id") ON DELETE CASCADE,
	"predicate" text NOT NULL,
	"memory_id" text REFERENCES "memories"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "relations_tenant_idx" ON "relations"("tenant_id");
CREATE INDEX IF NOT EXISTS "relations_from_idx" ON "relations"("from_entity_id");

-- Row Level Security: enable on tenant-scoped tables.
-- Application code always sets tenant filters, but RLS is a second layer.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relations" ENABLE ROW LEVEL SECURITY;
