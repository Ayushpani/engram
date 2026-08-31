-- Phase A6: per-user consolidated profile — a standing, evidence-backed
-- summary a voice agent can point-lookup at call start instead of paying
-- a fresh vector search for facts that never change session to session.

CREATE TABLE IF NOT EXISTS profiles (
	id text PRIMARY KEY,
	tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	user_id text NOT NULL,
	summary text NOT NULL,
	source_memory_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
	confidence_alpha real NOT NULL DEFAULT 1,
	confidence_beta real NOT NULL DEFAULT 1,
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_tenant_user_idx
	ON profiles (tenant_id, user_id);
