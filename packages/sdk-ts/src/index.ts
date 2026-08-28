export interface SmaranMemory {
	id: string
	tenantId: string
	userId: string | null
	sessionId: string | null
	text: string
	kind: "fact" | "preference" | "event" | "entity"
	source: "text" | "voice"
	createdAt: string
	updatedAt: string
	metadata: Record<string, unknown>
}

export interface SmaranRecallHit {
	memory: SmaranMemory
	score: number
	tier: "hot" | "session" | "cross"
}

export interface SmaranRecallResult {
	hits: SmaranRecallHit[]
	latencyMs: { total: number; embed: number; search: number; rerank: number }
}

export interface SmaranSaveOptions {
	text: string
	userId?: string
	sessionId?: string
	source?: "text" | "voice"
	metadata?: Record<string, unknown>
}

export interface SmaranRecallOptions {
	query: string
	userId?: string
	sessionId?: string
	topK?: number
	includeCrossSession?: boolean
}

export interface SmaranOptions {
	apiKey: string
	baseUrl?: string
	fetch?: typeof fetch
}

export class Smaran {
	private baseUrl: string
	private headers: Record<string, string>
	private fetchFn: typeof fetch

	constructor(opts: SmaranOptions) {
		this.baseUrl = (opts.baseUrl ?? "http://localhost:8787").replace(/\/$/, "")
		this.headers = {
			Authorization: `Bearer ${opts.apiKey}`,
			"Content-Type": "application/json",
		}
		this.fetchFn = opts.fetch ?? fetch
	}

	async save(opts: SmaranSaveOptions): Promise<SmaranMemory[]> {
		const res = await this.request("/v1/memories", "POST", opts)
		return (res as { memories: SmaranMemory[] }).memories
	}

	async recall(opts: SmaranRecallOptions): Promise<SmaranRecallResult> {
		return (await this.request("/v1/recall", "POST", opts)) as SmaranRecallResult
	}

	async forget(id: string): Promise<void> {
		await this.request(`/v1/memories/${encodeURIComponent(id)}`, "DELETE")
	}

	async *subscribe(sessionId: string): AsyncIterable<unknown> {
		const res = await this.fetchFn(
			`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/subscribe`,
			{ headers: this.headers },
		)
		if (!res.ok || !res.body) {
			throw new Error(`subscribe: ${res.status}`)
		}
		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buf = ""
		while (true) {
			const { done, value } = await reader.read()
			if (done) return
			buf += decoder.decode(value, { stream: true })
			const parts = buf.split("\n\n")
			buf = parts.pop() ?? ""
			for (const part of parts) {
				const dataLine = part
					.split("\n")
					.find((l) => l.startsWith("data:"))
				if (dataLine) yield JSON.parse(dataLine.slice(5).trim())
			}
		}
	}

	private async request(path: string, method: string, body?: unknown): Promise<unknown> {
		const res = await this.fetchFn(`${this.baseUrl}${path}`, {
			method,
			headers: this.headers,
			body: body ? JSON.stringify(body) : undefined,
		})
		if (!res.ok) {
			throw new Error(`smaran: ${res.status} ${await res.text()}`)
		}
		if (res.status === 204) return null
		return await res.json()
	}
}
