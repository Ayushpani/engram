import {
	type AdapterScope,
	buildRecalledContext,
	handleMemoryToolCall,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"

/**
 * Vercel AI SDK plugin. Two entry points:
 *   memoryTools(memory, scope) — returns a tools object you drop into
 *                                 `generateText`/`streamText`.
 *   withRecalledContext(memory, messages, opts) — silent injection.
 * Structurally compatible with the AI SDK's tool definition shape:
 *   { description, parameters (JSON Schema), execute }.
 */

export interface VercelToolDef {
	description: string
	parameters: {
		type: "object"
		properties: Record<string, { type: string; description: string }>
		required: string[]
	}
	execute: (args: Record<string, unknown>) => Promise<string>
}

export function memoryTools(
	client: MemoryClient,
	scope: AdapterScope,
): Record<string, VercelToolDef> {
	const out: Record<string, VercelToolDef> = {}
	for (const spec of memoryToolSpecs) {
		out[spec.name] = {
			description: spec.description,
			parameters: spec.parameters,
			execute: async (args) => {
				const res = await handleMemoryToolCall(
					client,
					{ name: spec.name, input: args },
					scope,
				)
				return res.content
			},
		}
	}
	return out
}

export interface VercelMessage {
	role: "system" | "user" | "assistant" | "tool"
	content: string | Array<{ type: string; text?: string; [k: string]: unknown }>
	[k: string]: unknown
}

export async function withRecalledContext(
	client: MemoryClient,
	messages: VercelMessage[],
	opts: AdapterScope & { topK?: number } = {},
): Promise<VercelMessage[]> {
	const last = [...messages].reverse().find((m) => m.role === "user")
	const lastText = last ? messageText(last) : ""
	const recalled = await buildRecalledContext(client, lastText, opts)
	if (!recalled) return messages

	const [head, ...rest] = messages
	if (head?.role === "system" && typeof head.content === "string") {
		return [{ ...head, content: `${head.content}\n\n${recalled}` }, ...rest]
	}
	return [{ role: "system", content: recalled }, ...messages]
}

function messageText(m: VercelMessage): string {
	if (typeof m.content === "string") return m.content
	return m.content
		.filter((b) => b.type === "text" && typeof b.text === "string")
		.map((b) => b.text as string)
		.join("\n")
}
