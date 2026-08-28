import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) {
	console.error("DATABASE_URL required")
	process.exit(1)
}

const tenantName = process.argv[2] ?? "dev"

function randHex(bytes: number): string {
	const arr = new Uint8Array(bytes)
	crypto.getRandomValues(arr)
	return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}

async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
}

const sql = postgres(url, { max: 1 })
try {
	const tenantId = `ten_${randHex(8)}`
	const apiKeyRaw = `sk_${randHex(24)}`
	const apiKeyId = `key_${randHex(8)}`
	const hashed = await sha256Hex(apiKeyRaw)

	await sql`INSERT INTO tenants (id, name) VALUES (${tenantId}, ${tenantName})`
	await sql`
		INSERT INTO api_keys (id, tenant_id, hashed_key, label)
		VALUES (${apiKeyId}, ${tenantId}, ${hashed}, ${"seeded"})
	`

	console.log("tenant   :", tenantId)
	console.log("api key  :", apiKeyRaw)
	console.log("(store the api key safely — only the hash is kept in the db)")
} catch (err) {
	console.error("seed failed:", err)
	process.exit(1)
} finally {
	await sql.end({ timeout: 5 })
}
