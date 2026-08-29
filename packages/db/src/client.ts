import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema.ts"

export type Db = ReturnType<typeof drizzle<typeof schema>>

export interface DbOptions {
	url: string
	max?: number
	prepare?: boolean
}

/**
 * Supabase connection: use the *pooled* connection string
 * (aws-0-*.pooler.supabase.com:6543) with `prepare: false`.
 * Set the direct 5432 URL for migrations only.
 */
export function createDb(opts: DbOptions): Db {
	const client = postgres(opts.url, {
		max: opts.max ?? 10,
		prepare: opts.prepare ?? false,
	})
	return drizzle(client, { schema })
}

export { schema }
