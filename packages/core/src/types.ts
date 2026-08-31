export type TenantId = string
export type SessionId = string
export type MemoryId = string
export type UserId = string

export interface Memory {
	id: MemoryId
	tenantId: TenantId
	userId: UserId | null
	sessionId: SessionId | null
	text: string
	kind: "fact" | "preference" | "event" | "entity"
	source: "text" | "voice"
	createdAt: string
	updatedAt: string
	metadata: Record<string, unknown>

	// Bi-temporal validity. validUntil = null means "still current".
	validFrom: string
	validUntil: string | null
	supersedesId: MemoryId | null

	// Beta-Binomial belief (see belief.ts). confidence = alpha/(alpha+beta).
	confidenceAlpha: number
	confidenceBeta: number

	// Decay inputs for the temporal RRF channel.
	accessCount: number
	lastAccessedAt: string | null
}

export interface SaveInput {
	tenantId: TenantId
	userId?: UserId | null
	sessionId?: SessionId | null
	text: string
	source?: "text" | "voice"
	metadata?: Record<string, unknown>
	/** When set, closes out the prior memory's validity and links this one as its replacement. */
	revises?: MemoryId
}

export interface RecallQuery {
	tenantId: TenantId
	userId?: UserId | null
	sessionId?: SessionId | null
	query: string
	topK?: number
	includeCrossSession?: boolean
	/** Point-in-time recall: only facts valid as of this instant. Defaults to now. */
	asOf?: string
}

export interface RecallHit {
	memory: Memory
	score: number
	tier: "hot" | "session" | "cross"
	/** Per-channel ranks this hit appeared at, before RRF fusion (debugging/audit). */
	channels?: Partial<Record<"dense" | "keyword" | "graph" | "temporal", number>>
}

export interface RecallResult {
	hits: RecallHit[]
	latencyMs: {
		total: number
		embed: number
		search: number
		rerank: number
	}
}

export type MemoryEvent =
	| { type: "memory.saved"; memory: Memory }
	| { type: "memory.forgotten"; id: MemoryId }
	| { type: "session.turn"; sessionId: SessionId; text: string }
