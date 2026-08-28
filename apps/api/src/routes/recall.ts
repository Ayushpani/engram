import { zValidator } from "@hono/zod-validator"
import type { MemoryCore } from "@repo/core"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"

const recallInput = z.object({
	query: z.string().min(1).max(4_000),
	userId: z.string().max(200).optional(),
	sessionId: z.string().max(200).optional(),
	topK: z.number().int().min(1).max(50).default(8),
	includeCrossSession: z.boolean().default(true),
})

export function recallRouter(core: MemoryCore) {
	return new Hono().post("/", zValidator("json", recallInput), async (c) => {
		const { tenantId } = auth(c)
		const body = c.req.valid("json")
		const result = await core.recall({ tenantId, ...body })
		return c.json(result)
	})
}
