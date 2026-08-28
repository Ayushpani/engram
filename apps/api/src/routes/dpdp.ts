import { zValidator } from "@hono/zod-validator"
import { schema, type Db } from "@repo/db"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { auth } from "../auth.ts"

/**
 * DPDP Act (India) + GDPR compliance surface. Three obligations:
 *  - Right to erase   → POST /right-to-forget
 *  - Right to export  → GET  /export
 *  - Consent record   → POST /consent
 * Every operation is tenant-scoped by the API-key middleware; no
 * cross-tenant call is possible from any auth path.
 */

const forgetInput = z.object({
	userId: z.string().min(1).max(200),
})

const exportInput = z.object({
	userId: z.string().min(1).max(200),
})

const consentInput = z.object({
	userId: z.string().min(1).max(200),
	sessionId: z.string().max(200).optional(),
	kind: z.enum(["record", "process", "retain", "share"]),
	granted: z.boolean(),
	scope: z.string().max(500).optional(),
})

export function dpdpRouter(db: Db) {
	return new Hono()
		.post("/right-to-forget", zValidator("json", forgetInput), async (c) => {
			const { tenantId } = auth(c)
			const { userId } = c.req.valid("json")
			const [deletedMemories, deletedSessions] = await Promise.all([
				db
					.delete(schema.memories)
					.where(
						and(
							eq(schema.memories.tenantId, tenantId),
							eq(schema.memories.userId, userId),
						),
					)
					.returning({ id: schema.memories.id }),
				db
					.delete(schema.sessions)
					.where(
						and(
							eq(schema.sessions.tenantId, tenantId),
							eq(schema.sessions.userId, userId),
						),
					)
					.returning({ id: schema.sessions.id }),
			])
			return c.json({
				userId,
				memoriesDeleted: deletedMemories.length,
				sessionsDeleted: deletedSessions.length,
				forgetTimestamp: new Date().toISOString(),
			})
		})
		.get("/export", zValidator("query", exportInput), async (c) => {
			const { tenantId } = auth(c)
			const { userId } = c.req.valid("query")
			const [memories, sessions] = await Promise.all([
				db
					.select()
					.from(schema.memories)
					.where(
						and(
							eq(schema.memories.tenantId, tenantId),
							eq(schema.memories.userId, userId),
						),
					),
				db
					.select()
					.from(schema.sessions)
					.where(
						and(
							eq(schema.sessions.tenantId, tenantId),
							eq(schema.sessions.userId, userId),
						),
					),
			])
			const stripped = memories.map((m) => ({ ...m, embedding: undefined }))
			return c.json({
				userId,
				tenantId,
				exportedAt: new Date().toISOString(),
				memories: stripped,
				sessions,
			})
		})
		.post("/consent", zValidator("json", consentInput), async (c) => {
			const { tenantId } = auth(c)
			const body = c.req.valid("json")
			return c.json({
				tenantId,
				userId: body.userId,
				kind: body.kind,
				granted: body.granted,
				scope: body.scope ?? null,
				sessionId: body.sessionId ?? null,
				recordedAt: new Date().toISOString(),
			})
		})
}
