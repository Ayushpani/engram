-- Phase A0: bi-temporal validity, Beta-Binomial belief, decay stats,
-- and the keyword + trigram indexes RRF fusion needs.
--
-- All additions are nullable / defaulted, so existing rows keep working
-- with no backfill required: valid_from defaults to created_at (via the
-- application layer on read), valid_until = NULL means "still current".

ALTER TABLE memories
	ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
	ADD COLUMN IF NOT EXISTS valid_until timestamptz,
	ADD COLUMN IF NOT EXISTS supersedes_id text REFERENCES memories(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS confidence_alpha real NOT NULL DEFAULT 1,
	ADD COLUMN IF NOT EXISTS confidence_beta real NOT NULL DEFAULT 1,
	ADD COLUMN IF NOT EXISTS access_count integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz;

-- Current-facts hot path: partial index, only rows that are still valid.
CREATE INDEX IF NOT EXISTS memories_tenant_user_current_idx
	ON memories (tenant_id, user_id, valid_until)
	WHERE valid_until IS NULL;

-- Keyword channel. 'simple' config = lowercasing + tokenizing only, no
-- English stemming and no English stopword list — this is the
-- language-neutral choice (a 'english' config would silently reintroduce
-- exactly the hardcoded-language problem this phase exists to remove).
ALTER TABLE memories
	ADD COLUMN IF NOT EXISTS text_tsv tsvector
	GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED;

CREATE INDEX IF NOT EXISTS memories_text_tsv_idx ON memories USING gin (text_tsv);

-- Fuzzy / cross-script-tolerant entity name matching for the graph channel.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS entities_name_trgm_idx
	ON entities USING gin (name gin_trgm_ops);
