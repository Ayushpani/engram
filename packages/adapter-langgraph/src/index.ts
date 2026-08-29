import {
	type AdapterScope,
	buildRecalledContext,
	handleMemoryToolCall,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"

/**
 * LangGraph.js helpers. Three entry points:
 *   memoryToolNodes(memory, scope) — Object of async node handlers keyed
 *                                    by tool name. Drop into a graph as
 *                                    conditional edges from the LLM node.
 *   recallNode(memory, opts)       — A ready-made StateGraph node that
 *                                    performs silent recall on state.
 *   memoryToolSchemas()            — Provider-agnostic tool descriptors
 *                                    for binding to the model.
 */

export interface LangGraphState {
	messages: Array<{
		role: "system" | "user" | "assistant" | "tool"
		content: string
		[k: string]: unknown
	}>
	[k: string]: unknown
}

export interface LangGraphToolSchema {
	name: string
	description: string
	parameters: {
		type: "object"
		properties: Record<string, { type: string; description: string }>
		required: string[]
	}
}

export function memoryToolSchemas(): LangGraphToolSchema[] {
	return memoryToolSpecs.map((spec) => ({
		name: spec.name,
		description: spec.description,
		parameters: spec.parameters,
	}))
}

export type NodeHandler = (
	state: LangGraphState,
) => Promise<Partial<LangGraphState>>

export function memoryToolNodes(
	client: MemoryClient,
	scope: AdapterScope,
): Record<string, NodeHandler> {
	const nodes: Record<string, NodeHandler> = {}
	for (const spec of memoryToolSpecs) {
		nodes[spec.name] = async (state) => {
			const last = state.messages[state.messages.length - 1] as
				| (Record<string, unknown> & {
						args?: Record<string, unknown>
						tool_call?: { args?: Record<string, unknown> }
				  })
				| undefined
			const args = (last?.args ?? last?.tool_call?.args ?? {}) as Record<
				string,
				unknown
			>
			const res = await handleMemoryToolCall(
				client,
				{ name: spec.name, input: args },
				scope,
			)
			return {
				messages: [
					...state.messages,
					{ role: "tool", content: res.content, name: spec.name },
				],
			}
		}
	}
	return nodes
}

export function recallNode(
	client: MemoryClient,
	opts: AdapterScope & { topK?: number } = {},
): NodeHandler {
	return async (state) => {
		const lastUser = [...state.messages]
			.reverse()
			.find((m) => m.role === "user")
		const lastText = lastUser?.content ?? ""
		const recalled = await buildRecalledContext(client, lastText, opts)
		if (!recalled) return {}
		const first = state.messages[0]
		if (first?.role === "system") {
			return {
				messages: [
					{ ...first, content: `${first.content}\n\n${recalled}` },
					...state.messages.slice(1),
				],
			}
		}
		return {
			messages: [{ role: "system", content: recalled }, ...state.messages],
		}
	}
}
