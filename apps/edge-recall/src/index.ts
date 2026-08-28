import { HeuristicReranker } from "@repo/models"

/**
 * Edge-recall worker. Deployed to Cloudflare's edge, terminates the
 * hot recall path close to the caller. Flow per request:
 *
 *   1. Auth passes through to the origin's key check (KV cache).
 *   2. Hot cache lookup keyed by (tenant, session, normalized query).
 *      Sub-millisecond KV read → straight response, no origin hop.
 *   3. Miss → origin call to /v1/recall via internal fetch (kept-alive
 *      to the region's Postgres pooler).
 *   4. Optional edge rerank via the WASM model bound at deploy time.
 *      Phase 5 ships the interface; the .wasm binary lands in Phase 6.
 *   5. Response written to KV with a short TTL so the next call is hot.
 *
 * Nothing in here talks to Postgres directly — that stays on the origin.
 * The worker is a hot cache + rerank tier and nothing more.
 */

interface Env {
	HOT_CACHE: KVNamespace
	ORIGIN_URL: string
}

interface RecallRequest {
	query: string
	userId?: string
	sessionId?: string
	topK?: number
	includeCrossSession?: boolean
	rerank?: boolean
}

interface OriginHit {
	memory: { id: string; text: string; kind: string }
	score: number
	tier?: "hot" | "session" | "cross"
}

interface OriginRecallResponse {
	hits: OriginHit[]
	latencyMs: { total: number; embed: number; search: number; rerank: number }
	reranker?: string
	rerankerSource?: string
}

const CACHE_TTL_SECONDS = 60
const CACHE_KEY_MAX_BYTES = 512

function normalizeQuery(q: string): string {
	return q.trim().toLowerCase().replace(/\s+/g, " ")
}

function cacheKey(tenantId: string, body: RecallRequest): string {
	const normalized = normalizeQuery(body.query)
	const parts: string[] = [
		tenantId,
		body.sessionId ?? "_",
		body.userId ?? "_",
		body.rerank ? "rk" : "nr",
		String(body.topK ?? 8),
		normalized,
	]
	const key = `rc:${parts.join(":")}`
	if (new TextEncoder().encode(key).length > CACHE_KEY_MAX_BYTES) {
		return `rc:${parts.slice(0, 5).join(":")}:${simpleHash(normalized)}`
	}
	return key
}

function simpleHash(s: string): string {
	let h = 2166136261 >>> 0
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 16777619) >>> 0
	}
	return h.toString(16)
}

export default {
	async fetch(
		req: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(req.url)

		if (url.pathname === "/health") {
			return Response.json({ ok: true, edge: true })
		}

		if (url.pathname !== "/v1/recall" || req.method !== "POST") {
			return proxyToOrigin(req, env)
		}

		const authHeader = req.headers.get("authorization")
		if (!authHeader?.startsWith("Bearer ")) {
			return Response.json({ error: "missing bearer token" }, { status: 401 })
		}

		let body: RecallRequest
		try {
			body = (await req.clone().json()) as RecallRequest
		} catch {
			return Response.json({ error: "invalid json" }, { status: 400 })
		}
		if (!body.query || body.query.length === 0) {
			return Response.json({ error: "empty query" }, { status: 400 })
		}

		const tenantId = deriveTenantId(authHeader)
		const key = cacheKey(tenantId, body)
		const cached = await env.HOT_CACHE.get(key, "json")
		if (cached) {
			return Response.json({
				...(cached as OriginRecallResponse),
				edgeTier: "hot",
			})
		}

		const originStart = Date.now()
		const originResponse = await fetch(new URL("/v1/recall", env.ORIGIN_URL), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: authHeader,
			},
			body: JSON.stringify(body),
		})
		if (!originResponse.ok) {
			return new Response(await originResponse.text(), {
				status: originResponse.status,
			})
		}
		const originJson = (await originResponse.json()) as OriginRecallResponse
		const originMs = Date.now() - originStart

		let payload: OriginRecallResponse & { edgeTier: string; edgeMs: number } = {
			...originJson,
			edgeTier: "session",
			edgeMs: originMs,
		}

		if (body.rerank && originJson.hits.length > 0) {
			const reranker = new HeuristicReranker()
			const candidates = originJson.hits.map((h) => ({
				id: h.memory.id,
				text: h.memory.text,
				score: h.score,
			}))
			const rerank = await reranker.rerank(
				body.query,
				candidates,
				body.topK ?? 8,
			)
			const scoreById = new Map(rerank.candidates.map((r) => [r.id, r.score]))
			payload = {
				...payload,
				hits: originJson.hits
					.filter((h) => scoreById.has(h.memory.id))
					.map((h) => ({
						...h,
						score: scoreById.get(h.memory.id) ?? h.score,
					}))
					.sort((a, b) => b.score - a.score),
				reranker: rerank.model,
				latencyMs: {
					...originJson.latencyMs,
					rerank: rerank.rerankMs,
					total: originMs + rerank.rerankMs,
				},
			}
		}

		ctx.waitUntil(
			env.HOT_CACHE.put(key, JSON.stringify(payload), {
				expirationTtl: CACHE_TTL_SECONDS,
			}),
		)
		return Response.json(payload)
	},
}

async function proxyToOrigin(req: Request, env: Env): Promise<Response> {
	const url = new URL(req.url)
	const target = new URL(url.pathname + url.search, env.ORIGIN_URL)
	return fetch(target.toString(), req)
}

function deriveTenantId(authHeader: string): string {
	const token = authHeader.slice(7)
	return simpleHash(token)
}
