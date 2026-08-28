import { sql } from "drizzle-orm"
import {
	customType,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	vector,
} from "drizzle-orm/pg-core"

export const EMBED_DIM = 1536

/**
 * float4[] fallback exposed as `Float32Array` for cases where pgvector
 * is unavailable at query time. The primary column stays `vector`.
 */
export const float4Array = customType<{ data: number[]; driverData: string }>({
	dataType() {
		return "real[]"
	},
})

export const tenants = pgTable("tenants", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const apiKeys = pgTable(
	"api_keys",
	{
		id: text("id").primaryKey(),
		tenantId: text("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		hashedKey: text("hashed_key").notNull(),
		label: text("label"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
	},
	(t) => ({
		hashedKeyIdx: uniqueIndex("api_keys_hashed_key_idx").on(t.hashedKey),
		tenantIdx: index("api_keys_tenant_idx").on(t.tenantId),
	}),
)

export const sessions = pgTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		tenantId: text("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		userId: text("user_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		tenantIdx: index("sessions_tenant_idx").on(t.tenantId),
	}),
)

export const memories = pgTable(
	"memories",
	{
		id: text("id").primaryKey(),
		tenantId: text("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		userId: text("user_id"),
		sessionId: text("session_id"),
		text: text("text").notNull(),
		kind: text("kind", { enum: ["fact", "preference", "event", "entity"] })
			.notNull()
			.default("fact"),
		source: text("source", { enum: ["text", "voice"] }).notNull().default("text"),
		embedding: vector("embedding", { dimensions: EMBED_DIM }),
		metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		tenantIdx: index("memories_tenant_idx").on(t.tenantId),
		sessionIdx: index("memories_session_idx").on(t.sessionId),
		userIdx: index("memories_user_idx").on(t.userId),
		embedHnsw: index("memories_embedding_hnsw")
			.using("hnsw", t.embedding.op("vector_cosine_ops"))
			.with({ m: 16, ef_construction: 64 }),
	}),
)

export const entities = pgTable(
	"entities",
	{
		id: text("id").primaryKey(),
		tenantId: text("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		kind: text("kind").notNull(),
		metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		tenantNameIdx: index("entities_tenant_name_idx").on(t.tenantId, t.name),
	}),
)

export const relations = pgTable(
	"relations",
	{
		id: text("id").primaryKey(),
		tenantId: text("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		fromEntityId: text("from_entity_id")
			.notNull()
			.references(() => entities.id, { onDelete: "cascade" }),
		toEntityId: text("to_entity_id")
			.notNull()
			.references(() => entities.id, { onDelete: "cascade" }),
		predicate: text("predicate").notNull(),
		memoryId: text("memory_id").references(() => memories.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		tenantIdx: index("relations_tenant_idx").on(t.tenantId),
		fromIdx: index("relations_from_idx").on(t.fromEntityId),
	}),
)
