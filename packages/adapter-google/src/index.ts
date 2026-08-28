import {
	type AdapterScope,
	type AutoRecallOptions,
	buildRecalledContext,
	handleMemoryToolCall,
	MEMORY_TOOL_NAMES,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"

/** Google GenAI function-declaration format. Wrap in `{ functionDeclarations: [...] }` when passing to `tools`. */
export interface GoogleFunctionDeclaration {
	name: string
	description: string
	parameters: {
		type: "OBJECT"
		properties: Record<string, { type: string; description: string }>
		required: string[]
	}
}

const upperType = (t: string): string => t.toUpperCase()

export function memoryFunctionDeclarations(): GoogleFunctionDeclaration[] {
	return memoryToolSpecs.map((spec) => ({
		name: spec.name,
		description: spec.description,
		parameters: {
			type: "OBJECT" as const,
			properties: Object.fromEntries(
				Object.entries(spec.parameters.properties).map(([k, v]) => [
					k,
					{ type: upperType(v.type), description: v.description },
				]),
			),
			required: spec.parameters.required,
		},
	}))
}

/** Convenience: the value to place in the model's `tools` array. */
export function memoryTools(): Array<{
	functionDeclarations: GoogleFunctionDeclaration[]
}> {
	return [{ functionDeclarations: memoryFunctionDeclarations() }]
}

/** Whatever Gemini returns from `response.functionCalls()`. */
export interface GoogleFunctionCall {
	name: string
	args: Record<string, unknown>
}

/**
 * Execute a memory function call and return the `functionResponse` part
 * to include in the next `generateContent` turn.
 */
export async function handleFunctionCall(
	client: MemoryClient,
	call: GoogleFunctionCall,
	scope: AdapterScope,
): Promise<{
	functionResponse: { name: string; response: { content: string } }
}> {
	const res = await handleMemoryToolCall(
		client,
		{ name: call.name, input: call.args ?? {} },
		scope,
	)
	return {
		functionResponse: { name: call.name, response: { content: res.content } },
	}
}

export function isMemoryFunctionCall(call: { name?: string }): boolean {
	return (
		call.name === MEMORY_TOOL_NAMES.save ||
		call.name === MEMORY_TOOL_NAMES.recall
	)
}

/** Gemini `contents` entry shape used for context injection. */
export interface GoogleContent {
	role: "user" | "model"
	parts: Array<{ text?: string; [k: string]: unknown }>
}

/**
 * Recall against the last user message and return an updated
 * `{ systemInstruction, contents }` pair. Gemini takes a
 * `systemInstruction` string on the model config; the caller merges it.
 */
export async function withRecalledContext(
	client: MemoryClient,
	args: { systemInstruction?: string; contents: GoogleContent[] },
	opts: AutoRecallOptions = {},
): Promise<{ systemInstruction: string; contents: GoogleContent[] }> {
	const last = [...args.contents].reverse().find((c) => c.role === "user")
	const lastText = last ? contentText(last) : ""
	const recalled = await buildRecalledContext(client, lastText, opts)
	const systemInstruction = recalled
		? [args.systemInstruction, recalled].filter(Boolean).join("\n\n")
		: (args.systemInstruction ?? "")
	return { systemInstruction, contents: args.contents }
}

function contentText(c: GoogleContent): string {
	return c.parts
		.map((p) => (typeof p.text === "string" ? p.text : ""))
		.filter(Boolean)
		.join("\n")
}
