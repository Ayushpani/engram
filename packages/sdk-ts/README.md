# `@smaranai/sdk-ts`

Thin typed client for the memory API. Zero dependencies.

```ts
import { Smaran } from "@smaranai/sdk-ts"

const memory = new Smaran({
	apiKey: process.env.SMARAN_API_KEY!,
	baseUrl: "http://localhost:8787",
})

await memory.save({
	text: "The caller's daughter is named Aanya.",
	userId: "u_123",
	sessionId: "sess_abc",
	source: "voice",
})

const result = await memory.recall({
	query: "who is Aanya",
	sessionId: "sess_abc",
	topK: 5,
})
console.log(result.hits, result.latencyMs)
```

The SDK will be published as `smaran-node` when Phase 6 opens the SDKs
publicly. Until then it lives inside the monorepo and is the ground truth the
Anthropic, OpenAI, Gemini, Vapi, Retell, LangGraph, and Vercel AI SDK adapters
will be written against in Phase 2.
