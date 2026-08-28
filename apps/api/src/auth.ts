import { and, eq, isNull } from "drizzle-orm"
import type { Context, MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import type { Db } from "@repo/db"
import { schema } from "@repo/db"

export interface AuthContext {
	tenantId: string
	apiKeyId: string
}

declare module "hono" {
	interface ContextVariableMap {
		auth: AuthContext
	}
}

async function hashKey(key: string): Promise<string> {
	const enc = new TextEncoder().encode(key)
	const buf = await crypto.subtle.digest("SHA-256", enc)
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

export function apiKeyAuth(db: Db): MiddlewareHandler {
	return async (c, next) => {
		const raw = c.req.header("Authorization")
		if (!raw?.startsWith("Bearer ")) {
			throw new HTTPException(401, { message: "missing bearer token" })
		}
		const token = raw.slice(7).trim()
		if (!token) throw new HTTPException(401, { message: "empty token" })

		const hashed = await hashKey(token)
		const [row] = await db
			.select({ id: schema.apiKeys.id, tenantId: schema.apiKeys.tenantId })
			.from(schema.apiKeys)
			.where(and(eq(schema.apiKeys.hashedKey, hashed), isNull(schema.apiKeys.revokedAt)))
			.limit(1)

		if (!row) throw new HTTPException(401, { message: "invalid api key" })
		c.set("auth", { tenantId: row.tenantId, apiKeyId: row.id })
		await next()
	}
}

export function auth(c: Context): AuthContext {
	return c.get("auth")
}
