import { handleVapiEvent, memoryFunctions } from "@repo/adapter-vapi"
import { Smaran } from "@repo/sdk-ts"
import { type CachedRecall, HotCache, StreamingSession } from "@repo/voice"
import { Hono } from "hono"

/**
 * Minimal working Vapi voice-agent server with memory. Deploy this
 * (Cloudflare Workers, Fly, Railway, Bun on a VPS) and point your
 * Vapi assistant's Server URL at /vapi.
 *
 *   Vapi call starts
 *     → sends { type: "function-call", ... } for memory_save/recall
 *     → sends { type: "transcript", ... } on every partial + final
 *     → sends { type: "end-of-call-report", ... } when the call ends
 *
 * Everything below is the smallest server that turns that stream into
 * durable memory + sub-cache-tier recall. Nothing here reads config
 * beyond two env vars — copy .env.example, fill in, run.
 *
 * In the Vapi dashboard, add the two functions returned by
 * memoryFunctions() to your assistant so the model can save + recall
 * on its own.
 */

const SMARAN_API_KEY = mustEnv("SMARAN_API_KEY")
const SMARAN_BASE_URL = process.env.SMARAN_BASE_URL ?? "http://localhost:8787"

const memory = new Smaran({
	apiKey: SMARAN_API_KEY,
	baseUrl: SMARAN_BASE_URL,
})
const cache = new HotCache<CachedRecall>({ ttlMs: 60_000 })
const sessions = new Map<string, StreamingSession>()

const app = new Hono()
	.get("/health", (c) =>
		c.json({ ok: true, sessions: sessions.size, cache: cache.size() }),
	)
	.get("/functions", (c) => c.json({ functions: memoryFunctions() }))
	.post("/vapi", async (c) => {
		const payload = (await c.req.json()) as {
			message?: {
				type?: string
				call?: { id?: string; customer?: { number?: string } }
			} & Record<string, unknown>
		}
		const msg = payload.message
		if (!msg) return c.json({ ok: true })

		const callId = msg.call?.id ?? "unknown"
		const userId = msg.call?.customer?.number ?? undefined

		let session = sessions.get(callId)
		if (!session) {
			session = new StreamingSession({
				sessionId: callId,
				userId,
				client: memory,
				cache,
				onError: (err) => console.error("session error", err),
			})
			sessions.set(callId, session)
		}

		const result = await handleVapiEvent(
			msg as Parameters<typeof handleVapiEvent>[0],
			{ memory, session, sessionId: callId, userId },
		)

		if (msg.type === "end-of-call-report") {
			sessions.delete(callId)
		}

		if (result.response) return c.json(result.response)
		return c.json({ ok: true })
	})

function mustEnv(name: string): string {
	const value = process.env[name]
	if (!value) throw new Error(`missing env var: ${name}`)
	return value
}

const port = Number(process.env.PORT ?? 8080)
console.log(
	`starter-vapi → http://localhost:${port} (smaran: ${SMARAN_BASE_URL})`,
)
export default { port, fetch: app.fetch }
