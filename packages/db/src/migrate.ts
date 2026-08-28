import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) {
	console.error("DATABASE_URL required")
	process.exit(1)
}

const here = fileURLToPath(new URL(".", import.meta.url))
const migrationsDir = join(here, "..", "migrations")

const files = readdirSync(migrationsDir)
	.filter((f) => f.endsWith(".sql"))
	.sort()

const sql = postgres(url, { max: 1 })

try {
	for (const f of files) {
		const contents = readFileSync(join(migrationsDir, f), "utf8")
		console.log(`→ ${f}`)
		await sql.unsafe(contents)
	}
	console.log("✓ migrations applied")
} catch (err) {
	console.error("migration failed:", err)
	process.exit(1)
} finally {
	await sql.end({ timeout: 5 })
}
