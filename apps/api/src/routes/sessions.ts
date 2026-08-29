import type { MemoryCore } from "@repo/core"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { auth } from "../auth.ts"

export function sessionsRouter(core: MemoryCore) {
	return new Hono().get("/:id/subscribe", (c) => {
		auth(c)
		const sessionId = c.req.param("id")
		const events = core.subscribe(sessionId)
		return streamSSE(c, async (stream) => {
			for await (const event of events) {
				await stream.writeSSE({
					event: event.type,
					data: JSON.stringify(event),
				})
			}
		})
	})
}
