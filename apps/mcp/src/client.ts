import Engram from "supermemory"

const MAX_CHARS = 200000 // ~50k tokens (character-based limit)
const DEFAULT_PROJECT_ID = "sm_project_default"

export type Memory =
	| {
			id: string
			memory: string
			similarity: number
			title?: string
			content?: string
	  }
	| {
			id: string
			chunk: string
			similarity: number
			title?: string
			content?: string
	  }

export interface SearchResult {
	results: Memory[]
	total: number
	timing: number
}

export interface Profile {
	static: string[]
	dynamic: string[]
}

export interface ProfileResponse {
	profile: Profile
	searchResults?: SearchResult
}

export interface Project {
	id: string
	name: string
	containerTag: string
	createdAt: string
	updatedAt: string
	isExperimental: boolean
	documentCount?: number
}

// Documents API types
export interface DocumentMemoryEntry {
	id: string
	memory: string
	spaceId: string
	isStatic?: boolean
	isLatest?: boolean
	isForgotten?: boolean
	forgetAfter?: string | null
	forgetReason?: string | null
	version?: number
	parentMemoryId?: string | null
	rootMemoryId?: string | null
	createdAt: string
	updatedAt: string
}

export interface DocumentWithMemories {
	id: string
	title: string | null
	summary?: string | null
	type: string
	createdAt: string
	updatedAt: string
	memoryEntries: DocumentMemoryEntry[]
}

export interface DocumentsApiResponse {
	documents: DocumentWithMemories[]
	pagination: {
		currentPage: number
		limit: number
		totalItems: number
		totalPages: number
	}
}

export function getMemoryText(m: Memory): string {
	return "memory" in m ? m.memory : m.chunk
}

function limitByChars(text: string, maxChars = MAX_CHARS): string {
	return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text
}

// Type for SDK search result item
interface SDKResult {
	id: string
	memory?: string
	chunk?: string
	content?: string
	similarity: number
	title?: string
	context?: string
}

export class EngramClient {
	private client: Engram
	private containerTag: string
	private bearerToken: string
	private apiUrl: string

	constructor(
		bearerToken: string,
		containerTag?: string,
		apiUrl = "https://api.engram.ai",
	) {
		this.bearerToken = bearerToken
		this.apiUrl = apiUrl
		this.client = new Engram({
			apiKey: bearerToken,
			baseURL: apiUrl,
		})
		this.containerTag = containerTag || DEFAULT_PROJECT_ID
	}

	// Create memory using SDK
	async createMemory(
		content: string,
	): Promise<{ id: string; status: string; containerTag: string }> {
		try {
			// Deduplication check: search for exact or highly similar memories first
			const searchResult = await this.search(content, 1, 0.95)
			if (searchResult?.results && searchResult.results.length > 0) {
				const topMatch = searchResult.results[0]
				console.log(`Duplicate found (similarity: ${topMatch.similarity}). Skipping creation.`)
				return {
					id: topMatch.id,
					status: "duplicate",
					containerTag: this.containerTag,
				}
			}

			const result = await this.client.add({
				content,
				containerTag: this.containerTag,
				metadata: {
					sm_source: "mcp",
				},
			})
			return {
				id: result.id,
				status: "queued",
				containerTag: this.containerTag,
			}
		} catch (error) {
			this.handleError(error)
		}
	}

	// Delete/forget memory - try exact match first, then semantic search
	async forgetMemory(
		content: string,
	): Promise<{ success: boolean; message: string; containerTag: string }> {
		try {
			// Try exact content matching first
			try {
				const result = await this.client.memories.forget({
					content: content,
					containerTag: this.containerTag,
				})

				return {
					success: true,
					message: `Successfully forgot memory (exact match) with ID: ${result.id}`,
					containerTag: this.containerTag,
				}
			} catch (error: unknown) {
				// If not 404, it's a real error - re-throw it
				const status =
					error && typeof error === "object" && "status" in error
						? (error as Record<string, unknown>).status
						: undefined
				if (status !== 404) {
					throw error
				}
				// Otherwise continue to semantic search fallback
			}

			// Fallback to semantic search if exact match fails
			const SIMILARITY_THRESHOLD = 0.85 // High threshold - only very similar memories
			const searchResult = await this.search(content, 5, SIMILARITY_THRESHOLD)

			if (searchResult.results.length === 0) {
				return {
					success: false,
					message: `No matching memory found to forget. Tried exact match and semantic search with similarity threshold ${SIMILARITY_THRESHOLD}.`,
					containerTag: this.containerTag,
				}
			}

			// Only actual memories (not chunks) can be forgotten
			const memoryToDelete = searchResult.results.find((r) => "memory" in r)
			if (!memoryToDelete) {
				return {
					success: false,
					message:
						"No matching memory found to forget (only document chunks matched in semantic search).",
					containerTag: this.containerTag,
				}
			}

			// Delete using the ID from semantic search
			await this.client.memories.forget({
				id: memoryToDelete.id,
				containerTag: this.containerTag,
			})

			const memoryText =
				getMemoryText(memoryToDelete) || memoryToDelete.content || ""
			return {
				success: true,
				message: `Forgot similar memory (semantic match, similarity: ${memoryToDelete.similarity.toFixed(2)}): "${limitByChars(memoryText, 100)}"`,
				containerTag: this.containerTag,
			}
		} catch (error) {
			this.handleError(error)
		}
	}

	// Search memories using SDK
	async search(
		query: string,
		limit = 10,
		threshold?: number,
	): Promise<SearchResult> {
		try {
			const result = await this.client.search.memories({
				q: query,
				limit: 50, // Request more candidates for reranking
				containerTag: this.containerTag,
				searchMode: "hybrid",
				threshold, // Optional threshold parameter
			})

			let rerankedSdkResults = result.results as SDKResult[]

			// Try edge reranking if we have results
			if (rerankedSdkResults.length > 0) {
				try {
					const rerankBody = {
						query,
						candidates: rerankedSdkResults.map((r) => ({
							id: r.id,
							content: r.content || r.memory || r.chunk || r.context || "",
							score: r.similarity,
						})),
					}

					const rerankResponse = await fetch(
						"https://engram-edge-reranker.ayushpanigrahi84.workers.dev/v3/search/rerank",
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(rerankBody),
						},
					)

					if (rerankResponse.ok) {
						const rerankData = (await rerankResponse.json()) as any
						if (rerankData.success && Array.isArray(rerankData.results)) {
							const scoreMap = new Map<string, number>()
							rerankData.results.forEach((r: any) => {
								scoreMap.set(r.id, r.crossEncoderScore)
							})

							rerankedSdkResults = rerankedSdkResults
								.map((r) => ({
									...r,
									similarity: scoreMap.has(r.id)
										? scoreMap.get(r.id)!
										: r.similarity,
								}))
								.sort((a, b) => b.similarity - a.similarity)
						}
					}
				} catch (error) {
					console.error("Edge reranking failed, falling back to base search:", error)
				}
			}

			// Apply original limit
			const finalResults = rerankedSdkResults.slice(0, limit)

			// Normalize and limit response size — preserve memory vs chunk distinction
			const results: Memory[] = finalResults.map((r) => {
				const text = limitByChars(
					r.content || r.memory || r.chunk || r.context || "",
				)
				const base = {
					id: r.id,
					similarity: r.similarity,
					title: r.title,
					content: r.content,
				}
				if (r.chunk && !r.memory) {
					return { ...base, chunk: text }
				}
				return { ...base, memory: text }
			})

			return {
				results,
				total: result.total,
				timing: result.timing,
			}
		} catch (error) {
			this.handleError(error)
		}
	}

	// Get user profile using SDK
	async getProfile(query?: string): Promise<ProfileResponse> {
		try {
			const result = await this.client.profile({
				containerTag: this.containerTag,
				q: query,
			})

			const response: ProfileResponse = {
				profile: {
					static: result.profile?.static || [],
					dynamic: result.profile?.dynamic || [],
				},
			}

			if (result.searchResults) {
				let rerankedSdkResults = result.searchResults.results as SDKResult[]

				if (query && rerankedSdkResults.length > 0) {
					try {
						const rerankBody = {
							query,
							candidates: rerankedSdkResults.map((r) => ({
								id: r.id,
								content: r.content || r.memory || r.chunk || r.context || "",
								score: r.similarity,
							})),
						}

						const rerankResponse = await fetch(
							"https://engram-edge-reranker.ayushpanigrahi84.workers.dev/v3/search/rerank",
							{
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify(rerankBody),
							},
						)

						if (rerankResponse.ok) {
							const rerankData = (await rerankResponse.json()) as any
							if (rerankData.success && Array.isArray(rerankData.results)) {
								const scoreMap = new Map<string, number>()
								rerankData.results.forEach((r: any) => {
									scoreMap.set(r.id, r.crossEncoderScore)
								})

								rerankedSdkResults = rerankedSdkResults
									.map((r) => ({
										...r,
										similarity: scoreMap.has(r.id)
											? scoreMap.get(r.id)!
											: r.similarity,
									}))
									.sort((a, b) => b.similarity - a.similarity)
							}
						}
					} catch (error) {
						console.error("Edge reranking for profile failed:", error)
					}
				}

				response.searchResults = {
					results: rerankedSdkResults.map((r) => {
						const text = limitByChars(
							r.content || r.memory || r.chunk || r.context || "",
						)
						const base = {
							id: r.id,
							similarity: r.similarity,
							title: r.title,
							content: r.content,
						}
						if (r.chunk && !r.memory) {
							return { ...base, chunk: text }
						}
						return { ...base, memory: text }
					}),
					total: result.searchResults.total,
					timing: result.searchResults.timing,
				}
			}

			return response
		} catch (error) {
			this.handleError(error)
		}
	}

	// Get projects list
	async getProjects(): Promise<string[]> {
		try {
			const response = await fetch(`${this.apiUrl}/v3/projects`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.bearerToken}`,
					"Content-Type": "application/json",
				},
			})

			if (!response.ok) {
				if (response.status === 401) {
					throw new Error("Authentication failed. Please re-authenticate.")
				}
				throw new Error(`Failed to fetch projects: ${response.statusText}`)
			}

			const data = (await response.json()) as {
				projects: Project[]
			}
			return data.projects?.map((p) => p.containerTag) || []
		} catch (error) {
			this.handleError(error)
		}
	}

	// Fetch documents with their memory entries
	async getDocuments(
		containerTags?: string[],
		page = 1,
		limit = 10,
	): Promise<DocumentsApiResponse> {
		try {
			const response = await fetch(`${this.apiUrl}/v3/documents/documents`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.bearerToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					page,
					limit,
					sort: "createdAt",
					order: "desc",
					containerTags,
				}),
			})
			if (!response.ok) {
				throw Object.assign(new Error("Failed to fetch documents"), {
					status: response.status,
				})
			}
			return (await response.json()) as DocumentsApiResponse
		} catch (error) {
			this.handleError(error)
		}
	}

	private handleError(error: unknown): never {
		// Handle network/fetch errors
		if (error instanceof TypeError) {
			if (
				error.message.includes("fetch") ||
				error.message.includes("network")
			) {
				throw new Error(
					"Network error. Please check your connection and try again.",
				)
			}
		}

		// Handle HTTP status errors from SDK/fetch
		if (error && typeof error === "object" && "status" in error) {
			const status = (error as { status: number }).status
			const message =
				"message" in error ? (error as { message: string }).message : undefined

			switch (status) {
				case 400:
				case 422:
					throw new Error(
						message || "Invalid request parameters. Please check your input.",
					)
				case 401:
					throw new Error("Authentication failed. Please re-authenticate.")
				case 402:
					throw new Error("Memory limit reached. Upgrade at engram.ai")
				case 403:
					throw new Error(
						"Access forbidden. Your account may be restricted or blocked.",
					)
				case 404:
					throw new Error("Memory not found. It may have been deleted.")
				case 429:
					throw new Error(
						"Rate limit exceeded. Please wait a moment and try again.",
					)
				default:
					if (status >= 500) {
						throw new Error(
							"Server error. The service may be temporarily unavailable. Please try again later.",
						)
					}
			}
		}

		// Re-throw Error instances as-is
		if (error instanceof Error) {
			throw error
		}

		// Wrap unknown errors
		throw new Error(`An unexpected error occurred: ${String(error)}`)
	}
}
