/**
 * First-party client for Smaran's real API (apps/api): POST /v1/recall,
 * POST /v1/memories, DELETE /v1/memories/:id. No third-party SDK, no
 * assumed accounts/projects layer — just the self-hosted API surface that
 * actually exists.
 */

const MAX_CHARS = 200000 // ~50k tokens (character-based limit)
export const DEFAULT_USER_ID = "default"

export interface MemoryHit {
	id: string
	text: string
	score: number
	tier: string
}

export interface RecallResult {
	hits: MemoryHit[]
	latencyMs: number
}

export interface SaveResult {
	id: string | null
	saved: boolean
}

function limitByChars(text: string, maxChars = MAX_CHARS): string {
	return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message)
		this.name = "ApiError"
	}
}

export class SmaranClient {
	constructor(
		private apiKey: string,
		private apiUrl: string,
	) {}

	private headers(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
		}
	}

	private async request<T>(path: string, init: RequestInit): Promise<T> {
		let response: Response
		try {
			response = await fetch(`${this.apiUrl}${path}`, {
				...init,
				headers: { ...this.headers(), ...(init.headers as Record<string, string>) },
			})
		} catch {
			throw new Error("Network error. Please check your connection and try again.")
		}

		if (!response.ok) {
			const text = await response.text().catch(() => "")
			if (response.status === 401) {
				throw new ApiError("Authentication failed. Check your Smaran API key.", 401)
			}
			if (response.status === 429) {
				throw new ApiError("Rate limit exceeded. Please wait a moment and try again.", 429)
			}
			if (response.status >= 500) {
				throw new ApiError("Server error. The service may be temporarily unavailable.", response.status)
			}
			throw new ApiError(text || `Request failed with status ${response.status}`, response.status)
		}

		if (response.status === 204) {
			return undefined as T
		}
		return (await response.json()) as T
	}

	async recall(
		query: string,
		userId: string,
		sessionId?: string,
		topK = 5,
	): Promise<RecallResult> {
		const start = Date.now()
		const body: Record<string, unknown> = { query, userId, topK, includeCrossSession: true }
		if (sessionId) body.sessionId = sessionId

		const data = await this.request<{
			hits: { memory: { id: string; text: string }; score: number; tier: string }[]
		}>("/v1/recall", { method: "POST", body: JSON.stringify(body) })

		const hits: MemoryHit[] = data.hits
			.filter((h) => h.memory?.text)
			.map((h) => ({
				id: h.memory.id,
				text: limitByChars(h.memory.text),
				score: h.score,
				tier: h.tier,
			}))

		return { hits, latencyMs: Date.now() - start }
	}

	async save(text: string, userId: string, sessionId?: string): Promise<SaveResult> {
		const body: Record<string, unknown> = { text, userId }
		if (sessionId) body.sessionId = sessionId

		const data = await this.request<{ memories: { id: string }[] }>("/v1/memories", {
			method: "POST",
			body: JSON.stringify(body),
		})

		const saved = data.memories && data.memories.length > 0
		return { id: saved ? data.memories[0].id : null, saved }
	}

	async forget(id: string): Promise<void> {
		await this.request<void>(`/v1/memories/${encodeURIComponent(id)}`, { method: "DELETE" })
	}

	/**
	 * Forget by content when the caller doesn't know the memory's ID: recall
	 * the closest match and, if it's a strong match, delete it.
	 */
	async forgetByContent(
		content: string,
		userId: string,
		sessionId?: string,
	): Promise<{ found: boolean; deletedText?: string; similarity?: number }> {
		const SIMILARITY_THRESHOLD = 0.3 // RRF-fused scores are small; this is a "close enough" bar, not cosine similarity
		const { hits } = await this.recall(content, userId, sessionId, 1)

		if (hits.length === 0 || hits[0].score < SIMILARITY_THRESHOLD) {
			return { found: false }
		}

		const match = hits[0]
		await this.forget(match.id)
		return { found: true, deletedText: limitByChars(match.text, 100), similarity: match.score }
	}
}
