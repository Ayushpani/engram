import {
	createCore,
	createOpenAIEmbedder,
	HashEmbedder,
	HeuristicConsolidator,
	type Embedder,
} from "@repo/core"
import { createDb, createSupabaseStore } from "@repo/db"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { apiKeyAuth } from "./auth.ts"
import { loadEnv } from "./env.ts"
import { dpdpRouter } from "./routes/dpdp.ts"
import { ingestRouter } from "./routes/ingest.ts"
import { memoriesRouter } from "./routes/memories.ts"
import { recallRouter } from "./routes/recall.ts"
import { sessionsRouter } from "./routes/sessions.ts"

const env = loadEnv()

const db = createDb({ url: env.DATABASE_URL })

const embedder: Embedder =
	env.EMBEDDER === "openai" && env.OPENAI_API_KEY
		? createOpenAIEmbedder({
				apiKey: env.OPENAI_API_KEY,
				model: env.OPENAI_EMBED_MODEL,
				baseUrl: env.OPENAI_BASE_URL,
			})
		: new HashEmbedder()

const core = createCore({
	store: createSupabaseStore(db),
	embedder,
	consolidator: new HeuristicConsolidator(),
})

const app = new Hono()
	.use(logger())
	.use(cors({ origin: env.CORS_ORIGIN }))
	.get("/health", (c) => c.json({ ok: true, embedder: env.EMBEDDER }))
	.get("/", (c) =>
		c.json({
			name: "smaran-api",
			version: "0.1.0",
			docs: "https://claude.ai/code/artifact/54275eeb-c4b3-4c03-b509-099e9d86dea6",
		}),
	)
	.use("/v1/*", apiKeyAuth(db))
	.route("/v1/memories", memoriesRouter(core))
	.route("/v1/recall", recallRouter(core))
	.route("/v1/sessions", sessionsRouter(core))
	.route("/v1/ingest", ingestRouter(core))
	.route("/v1/dpdp", dpdpRouter(db))

const port = env.PORT
console.log(`smaran-api → http://localhost:${port} (embedder: ${env.EMBEDDER})`)
export default { port, fetch: app.fetch }
