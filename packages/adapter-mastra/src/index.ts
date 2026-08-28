import {
	type AdapterScope,
	handleMemoryToolCall,
	type MemoryClient,
	memoryToolSpecs,
} from "@repo/core"

/**
 * Mastra tool wrapper. Mastra's createTool() takes:
 *   { id, description, inputSchema, execute }
 * where inputSchema is a Zod object. We return objects with the SAME
 * shape but with `parameters` as JSON Schema instead of Zod so users
 * can pipe into `z.object(...).describe(...)` at their end, or pass the
 * factory a zod builder to get real Mastra tools directly.
 */

export interface MastraToolDescriptor {
	id: string
	description: string
	parameters: {
		type: "object"
		properties: Record<string, { type: string; description: string }>
		required: string[]
	}
	execute: (input: Record<string, unknown>) => Promise<{ result: string }>
}

export function memoryToolDescriptors(
	client: MemoryClient,
	scope: AdapterScope,
): MastraToolDescriptor[] {
	return memoryToolSpecs.map((spec) => ({
		id: spec.name,
		description: spec.description,
		parameters: spec.parameters,
		execute: async (input) => {
			const res = await handleMemoryToolCall(
				client,
				{ name: spec.name, input },
				scope,
			)
			return { result: res.content }
		},
	}))
}

/**
 * Convenience for callers who already have `createTool` and a Zod
 * builder — pass both and get back real `Tool` instances bound to
 * this memory + scope.
 */
export interface MastraToolBuilder<T> {
	createTool: (spec: {
		id: string
		description: string
		inputSchema: unknown
		execute: (opts: { context: Record<string, unknown> }) => Promise<unknown>
	}) => T
	zObject: (shape: Record<string, unknown>) => unknown
	zString: () => unknown
	zNumberOptional: () => unknown
}

export function buildMemoryTools<T>(
	client: MemoryClient,
	scope: AdapterScope,
	builder: MastraToolBuilder<T>,
): T[] {
	const shape = (spec: (typeof memoryToolSpecs)[number]) => {
		const s: Record<string, unknown> = {}
		if (spec.parameters.properties.text) s.text = builder.zString()
		if (spec.parameters.properties.query) s.query = builder.zString()
		if (spec.parameters.properties.topK) s.topK = builder.zNumberOptional()
		return s
	}

	return memoryToolSpecs.map((spec) =>
		builder.createTool({
			id: spec.name,
			description: spec.description,
			inputSchema: builder.zObject(shape(spec)),
			execute: async ({ context }) => {
				const res = await handleMemoryToolCall(
					client,
					{ name: spec.name, input: context },
					scope,
				)
				return res.content
			},
		}),
	)
}
