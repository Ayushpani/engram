import { z } from "zod"

const schema = z
	.object({
		STORE: z.enum(["supabase", "memory"]).default("supabase"),
		DATABASE_URL: z.string().optional(),
		PORT: z.coerce.number().default(8787),
		EMBEDDER: z.enum(["hash", "openai"]).default("hash"),
		OPENAI_API_KEY: z.string().optional(),
		OPENAI_BASE_URL: z.string().optional(),
		OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
		CORS_ORIGIN: z.string().default("*"),
		SANDBOX_API_KEY: z.string().default("sk_local_dev"),
	})
	.refine(
		(e) =>
			e.STORE === "memory" || (e.DATABASE_URL && e.DATABASE_URL.length > 0),
		{
			message: "DATABASE_URL required when STORE=supabase",
			path: ["DATABASE_URL"],
		},
	)

export type Env = z.infer<typeof schema>

export function loadEnv(): Env {
	const parsed = schema.safeParse(process.env)
	if (!parsed.success) {
		console.error("env validation failed:", parsed.error.flatten().fieldErrors)
		process.exit(1)
	}
	return parsed.data
}
