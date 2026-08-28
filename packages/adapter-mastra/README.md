# `@repo/adapter-mastra`

Memory tools for [Mastra](https://mastra.ai). Two shapes: raw
descriptors you wire into your own `createTool` call, or a pass-through
builder that returns real `Tool` instances when you hand us Mastra's
`createTool` + a Zod builder.

```ts
import { createTool } from "@mastra/core/tools"
import { z } from "zod"
import { Smaran } from "@repo/sdk-ts"
import { buildMemoryTools } from "@repo/adapter-mastra"

const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const scope = { userId: "u_123", sessionId: "sess_abc" }

const tools = buildMemoryTools(memory, scope, {
	createTool,
	zObject: (shape) => z.object(shape),
	zString: () => z.string(),
	zNumberOptional: () => z.number().optional(),
})
```
