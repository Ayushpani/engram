# `@repo/adapter-google`

Memory tools + auto-context for Google Gemini (`@google/genai`) and the
Google Agent Kit.

## Model-driven memory (function calling)

```ts
import { GoogleGenAI } from "@google/genai"
import { Smaran } from "@repo/sdk-ts"
import { handleFunctionCall, memoryTools } from "@repo/adapter-google"

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const scope = { userId: "u_123", sessionId: "sess_abc" }

const res = await ai.models.generateContent({
	model: "gemini-…",
	contents: [{ role: "user", parts: [{ text: "Remember I prefer window seats." }] }],
	config: { tools: memoryTools() },
})

for (const call of res.functionCalls ?? []) {
	const fnResponse = await handleFunctionCall(memory, call, scope)
	// include fnResponse.parts in the next contents turn
}
```

## Auto-context (silent recall)

```ts
import { withRecalledContext } from "@repo/adapter-google"

const { systemInstruction, contents } = await withRecalledContext(
	memory,
	{
		systemInstruction: "You are a helpful assistant.",
		contents: [{ role: "user", parts: [{ text: "book me a flight to Delhi" }] }],
	},
	{ sessionId: "sess_abc", topK: 5 },
)
const res = await ai.models.generateContent({
	model,
	contents,
	config: { systemInstruction },
})
```
