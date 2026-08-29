-- Phase 5.6 — per-tenant model registry.
-- Stores which distilled embedder / reranker each tenant is bound to.
-- A row with tenant_id = NULL is the platform default; every tenant
-- inherits it unless a tenant-specific row exists.

CREATE TABLE IF NOT EXISTS "model_registry" (
	"id" text PRIMARY KEY,
	"tenant_id" text REFERENCES "tenants"("id") ON DELETE CASCADE,
	"role" text NOT NULL CHECK ("role" IN ('embedder','reranker')),
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"activated_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "model_registry_tenant_role_idx"
	ON "model_registry" ("tenant_id", "role");

CREATE UNIQUE INDEX IF NOT EXISTS "model_registry_active_per_tenant_idx"
	ON "model_registry" ("tenant_id", "role")
	WHERE "activated_at" IS NOT NULL;

ALTER TABLE "model_registry" ENABLE ROW LEVEL SECURITY;
