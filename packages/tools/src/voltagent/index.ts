/**
 * VoltAgent integration for Engram.
 *
 * Provides a wrapper function that enhances VoltAgent agent configurations
 * with Engram hooks for automatic memory injection and storage.
 *
 * @module
 */

import { createEngramHooks, mergeHooks } from "./hooks"
import type { VoltAgentConfig, EngramVoltAgent } from "./types"

/**
 * Configuration options for withEngram.
 */
interface WithEngramOptions<T extends VoltAgentConfig>
	extends EngramVoltAgent {
	/**
	 * The VoltAgent agent configuration to enhance
	 */
	agentConfig: T

	/**
	 * Required. The container tag/user ID for scoping memories (e.g., "user-123")
	 */
	containerTag: string
}

/**
 * Enhances a VoltAgent agent configuration with Engram memory capabilities.
 *
 * The function injects hooks that automatically:
 * - Retrieve relevant memories before LLM calls (via onPrepareMessages)
 * - Inject memories into the system prompt
 * - Optionally save conversations after completion (via onEnd)
 *
 * @param options - Configuration object containing agent config and Engram options
 * @param options.agentConfig - The VoltAgent agent configuration to enhance
 * @param options.containerTag - Required. The container tag/user ID for scoping memories (e.g., "user-123")
 * @param options.mode - Memory retrieval mode: "profile" (default), "query", or "full"
 * @param options.addMemory - Memory persistence: "always" (default for VoltAgent) or "never"
 * @param options.customId - Required. Custom ID to group messages into a single document
 * @param options.apiKey - Engram API key (falls back to ENGRAM_API_KEY env var)
 * @param options.baseUrl - Custom Engram API base URL
 * @param options.promptTemplate - Custom function to format memory data into prompt
 * @param options.threshold - Search sensitivity: 0 (more results) to 1 (more accurate). Default: 0.1
 * @param options.limit - Maximum number of memory results to return. Default: 10
 * @param options.rerank - If true, rerank results for relevance. Default: false
 * @param options.rewriteQuery - If true, AI-rewrite query for better results (+400ms latency). Default: false
 * @param options.filters - Advanced AND/OR filters for search
 * @param options.include - Control what additional data to include (chunks, documents, etc.)
 * @param options.metadata - Optional metadata to attach to saved conversations
 * @param options.searchMode - Search mode: "memories" (atomic facts), "documents" (chunks), or "hybrid" (both)
 * @param options.entityContext - Context for memory extraction (max 1500 chars), guides how memories are understood
 * @returns Enhanced agent config with Engram hooks injected
 *
 * @example
 * Basic usage with profile memories:
 * ```typescript
 * import { withEngram } from "@engram/tools/voltagent"
 * import { Agent } from "@voltagent/core"
 * import { VercelAIProvider } from "@voltagent/vercel-ai"
 * import { openai } from "@ai-sdk/openai"
 *
 * const configWithMemory = withEngram({
 *   agentConfig: {
 *     name: "my-agent",
 *     instructions: "You are a helpful assistant",
 *     llm: new VercelAIProvider(),
 *     model: openai("gpt-4o"),
 *   },
 *   containerTag: "user-123",
 *   customId: "conversation-123"
 * })
 *
 * const agent = new Agent(configWithMemory)
 * ```
 *
 * @example
 * Advanced usage with full memory mode and conversation saving:
 * ```typescript
 * const configWithMemory = withEngram({
 *   agentConfig: {
 *     name: "my-agent",
 *     instructions: "You are a helpful assistant",
 *     llm: new VercelAIProvider(),
 *     model: openai("gpt-4o"),
 *   },
 *   containerTag: "user-123",      // Required: user/project ID
 *   mode: "full",                   // "profile" | "query" | "full"
 *   addMemory: "always",            // "always" | "never"
 *   customId: "conv-456",           // Group messages by conversation
 *   threshold: 0.7,                 // 0.0-1.0 (higher = more accurate)
 *   limit: 15,                      // Max results to return
 *   rerank: true,                   // Rerank for best relevance
 *   searchMode: "hybrid",           // "memories" | "documents" | "hybrid"
 *   entityContext: "This is John, a software engineer saving technical discussions",
 *   metadata: {                     // Custom metadata
 *     source: "voltagent",
 *     version: "1.0"
 *   }
 * })
 *
 * const agent = new Agent(configWithMemory)
 *
 * // Use the agent - memories are automatically injected
 * const result = await agent.generateText({
 *   messages: [{ role: "user", content: "What's my favorite programming language?" }]
 * })
 * ```
 *
 * @example
 * Custom prompt template:
 * ```typescript
 * const configWithMemory = withEngram({
 *   agentConfig: {
 *     name: "my-agent",
 *     instructions: "...",
 *     llm: new VercelAIProvider(),
 *     model: openai("gpt-4o"),
 *   },
 *   containerTag: "user-123",
 *   customId: "conversation-123",
 *   mode: "full",
 *   promptTemplate: (data) => `
 *     <user_context>
 *     ${data.userMemories}
 *     ${data.generalSearchMemories}
 *     </user_context>
 *   `.trim()
 * })
 *
 * const agent = new Agent(configWithMemory)
 * ```
 *
 * @throws {Error} When neither `options.apiKey` nor `process.env.ENGRAM_API_KEY` are set
 * @throws {Error} When Engram API request fails
 */
export function withEngram<T extends VoltAgentConfig>(
	options: WithEngramOptions<T>,
): T {
	const { agentConfig, containerTag, ...engramOptions } = options

	// Create Engram hooks (internally creates its own context, validates API key)
	const engramHooks = createEngramHooks(
		containerTag,
		engramOptions,
	)

	// Merge with existing hooks if present
	const mergedHooks = mergeHooks(agentConfig.hooks, engramHooks)

	// Return enhanced config with merged hooks
	return {
		...agentConfig,
		hooks: mergedHooks,
	}
}

// Export types for consumers
export type {
	EngramVoltAgent,
	VoltAgentConfig,
	VoltAgentMessage,
	VoltAgentHooks,
	SearchFilters,
	IncludeOptions,
	PromptTemplate,
	MemoryMode,
	AddMemoryMode,
	MemoryPromptData,
} from "./types"

export type { WithEngramOptions }

// Note: WithEngramOptions is exported above separately because it's generic

// Export hook creation utilities for advanced use cases
export { createEngramHooks } from "./hooks"
