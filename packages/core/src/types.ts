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
}

export interface SaveInput {
	tenantId: TenantId
	userId?: UserId | null
	sessionId?: SessionId | null
	text: string
	source?: "text" | "voice"
	metadata?: Record<string, unknown>
}

export interface RecallQuery {
	tenantId: TenantId
	userId?: UserId | null
	sessionId?: SessionId | null
	query: string
	topK?: number
	includeCrossSession?: boolean
}

export interface RecallHit {
	memory: Memory
	score: number
	tier: "hot" | "session" | "cross"
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
