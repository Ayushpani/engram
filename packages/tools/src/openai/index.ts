import type OpenAI from "openai"
import {
	createOpenAIMiddleware,
	type OpenAIMiddlewareOptions,
} from "./middleware"

/**
 * Wraps an OpenAI client with SuperMemory middleware to automatically inject relevant memories
 * into both Chat Completions and Responses APIs based on the user's input content.
 *
 * For Chat Completions API: Searches for memories using the user message content and injects
 * them into the system prompt (appends to existing or creates new system prompt).
 *
 * For Responses API: Searches for memories using the input parameter and injects them into
 * the instructions parameter (appends to existing or creates new instructions).
 *
 * @param openaiClient - The OpenAI client to wrap with SuperMemory middleware
 * @param options - Configuration options for the middleware
 * @param options.containerTag - Required. The container tag/identifier for memory search (e.g., user ID, project ID)
 * @param options.customId - Required. Custom ID to group messages into a single document for contextual memory generation
 * @param options.verbose - Optional flag to enable detailed logging of memory search and injection process (default: false)
 * @param options.mode - Optional mode for memory search: "profile" (default), "query", or "full"
 * @param options.addMemory - Optional mode for memory addition: "always" (default), "never"
 *
 * @returns An OpenAI client with SuperMemory middleware injected for both Chat Completions and Responses APIs
 *
 * @example
 * ```typescript
 * import { withSmaran } from "@smaranai/tools/openai"
 * import OpenAI from "openai"
 *
 * // Create OpenAI client with smaran middleware
 * const openai = new OpenAI({
 *   apiKey: process.env.OPENAI_API_KEY,
 * })
 * const openaiWithSmaran = withSmaran(openai, {
 *   containerTag: "user-123",
 *   customId: "conversation-456",
 *   mode: "full",
 *   addMemory: "always"
 * })
 *
 * // Use with Chat Completions API - memories injected into system prompt
 * const chatResponse = await openaiWithSmaran.chat.completions.create({
 *   model: "gpt-4",
 *   messages: [
 *     { role: "user", content: "What's my favorite programming language?" }
 *   ]
 * })
 *
 * // Use with Responses API - memories injected into instructions
 * const response = await openaiWithSmaran.responses.create({
 *   model: "gpt-4o",
 *   instructions: "You are a helpful coding assistant",
 *   input: "What's my favorite programming language?"
 * })
 * ```
 *
 * @throws {Error} When SMARAN_API_KEY environment variable is not set
 * @throws {Error} When smaran API request fails
 */
export function withSmaran(
	openaiClient: OpenAI,
	options: OpenAIMiddlewareOptions,
) {
	if (!process.env.SMARAN_API_KEY) {
		throw new Error("SMARAN_API_KEY is not set")
	}

	if (!options.containerTag) {
		throw new Error(
			"containerTag is required — provide a non-empty string to identify the user/container",
		)
	}

	if (!options.customId) {
		throw new Error(
			"customId is required — provide a non-empty string to group messages into a single document",
		)
	}

	const { containerTag } = options
	const verbose = options.verbose ?? false
	const mode = options.mode ?? "profile"
	const addMemory = options.addMemory ?? "always"

	const openaiWithSmaran = createOpenAIMiddleware(
		openaiClient,
		containerTag,
		{
			...options,
			verbose,
			mode,
			addMemory,
		},
	)

	return openaiWithSmaran
}

export type { OpenAIMiddlewareOptions }
export type {
	MemorySearchResult,
	MemoryAddResult,
	ProfileResult,
	DocumentListResult,
	DocumentDeleteResult,
	DocumentAddResult,
	MemoryForgetResult,
} from "./tools"
export {
	createSearchMemoriesFunction,
	createAddMemoryFunction,
	createGetProfileFunction,
	createDocumentListFunction,
	createDocumentDeleteFunction,
	createDocumentAddFunction,
	createMemoryForgetFunction,
	smaranTools,
	getToolDefinitions,
	createToolCallExecutor,
	createToolCallsExecutor,
	createSearchMemoriesTool,
	createAddMemoryTool,
	createGetProfileTool,
	createDocumentListTool,
	createDocumentDeleteTool,
	createDocumentAddTool,
	createMemoryForgetTool,
	memoryToolSchemas,
} from "./tools"
