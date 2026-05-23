/**
 * VoltAgent hooks for Engram integration.
 *
 * Provides onPrepareMessages and onEnd hooks that inject memories
 * and save conversations.
 */

import type {
	VoltAgentHooks,
	HookPrepareMessagesArgs,
	HookEndArgs,
	VoltAgentMessage,
	EngramVoltAgent,
} from "./types"
import {
	createEngramContext,
	enhanceMessagesWithMemories,
	saveConversation,
} from "./middleware"

/**
 * Creates Engram hooks for VoltAgent agents.
 *
 * These hooks intercept the agent lifecycle to inject memories
 * before LLM calls and save conversations after completion.
 *
 * @param containerTag - The container tag/user ID for scoping memories
 * @param options - Configuration options for memory behavior
 * @returns VoltAgent hooks object with onPrepareMessages and onEnd
 *
 * @example
 * ```typescript
 * import { createEngramHooks } from "@engram/tools/voltagent"
 *
 * const hooks = createEngramHooks("user-123", {
 *   mode: "full",
 *   addMemory: "always",
 *   customId: "conv-456",
 * })
 *
 * const agent = new Agent({
 *   name: "my-agent",
 *   instructions: "You are a helpful assistant",
 *   llm: new VercelAIProvider(),
 *   model: openai("gpt-4o"),
 *   hooks
 * })
 * ```
 */
export function createEngramHooks(
	containerTag: string,
	options: EngramVoltAgent,
): VoltAgentHooks {
	const ctx = createEngramContext(containerTag, options)

	return {
		onPrepareMessages: async (
			args: HookPrepareMessagesArgs,
		): Promise<{ messages: VoltAgentMessage[] }> => {
			try {
				// VoltAgent passes user messages in args.context.input.messages
				// and the prepared messages (system + conversation) in args.messages
				const contextInput = args.context?.input as
					| { messages?: VoltAgentMessage[] }
					| undefined
				const inputMessages = contextInput?.messages || []

				ctx.logger.debug("onPrepareMessages called", {
					messageCount: args.messages.length,
					inputMessageCount: inputMessages.length,
					agentName: args.agent.name,
				})

				const enhancedMessages = await enhanceMessagesWithMemories(
					inputMessages,
					ctx,
					args.messages,
				)

				ctx.logger.debug("Messages enhanced with memories", {
					originalCount: args.messages.length,
					enhancedCount: enhancedMessages.length,
				})

				return { messages: enhancedMessages }
			} catch (error) {
				ctx.logger.error("Error in onPrepareMessages", {
					error: error instanceof Error ? error.message : "Unknown error",
				})
				return { messages: args.messages }
			}
		},

		onEnd: async (args: HookEndArgs): Promise<void> => {
			try {
				ctx.logger.debug("onEnd called", {
					agentName: args.agent.name,
					hasContext: !!args.context,
					hasOutput: !!args.output,
				})

				let messages: VoltAgentMessage[] = []

				if (args.context?.input && args.output) {
					const inputData = args.context.input as
						| { messages?: VoltAgentMessage[] }
						| undefined
					const inputMessages = inputData?.messages || []

					const outputData = args.output as
						| string
						| { text?: string; content?: string }
						| undefined
					const outputText =
						typeof outputData === "string"
							? outputData
							: outputData?.text || outputData?.content

					if (inputMessages.length > 0 && outputText) {
						messages = [
							...inputMessages,
							{ role: "assistant" as const, content: outputText },
						]
					}
				}

				if (messages.length === 0) {
					ctx.logger.debug("No messages to save, skipping")
					return
				}

				saveConversation(messages, ctx).catch((error) => {
					ctx.logger.error("Background conversation save failed", {
						error: error instanceof Error ? error.message : "Unknown error",
					})
				})
			} catch (error) {
				ctx.logger.error("Error in onEnd", {
					error: error instanceof Error ? error.message : "Unknown error",
				})
			}
		},
	}
}

/**
 * Merges Engram hooks with existing hooks from an agent config.
 * Preserves existing hooks and adds Engram hooks.
 *
 * @param existingHooks - Existing hooks from agent config (if any)
 * @param engramHooks - Engram hooks to merge
 * @returns Merged hooks object
 */
export function mergeHooks(
	existingHooks: VoltAgentHooks | undefined,
	engramHooks: VoltAgentHooks,
): VoltAgentHooks {
	if (!existingHooks) {
		return engramHooks
	}

	const mergedHooks: VoltAgentHooks = { ...existingHooks }

	if (existingHooks.onPrepareMessages && engramHooks.onPrepareMessages) {
		const existingOnPrepareMessages = existingHooks.onPrepareMessages
		const engramOnPrepareMessages = engramHooks.onPrepareMessages

		mergedHooks.onPrepareMessages = async (args) => {
			const resultAfterExisting = await existingOnPrepareMessages(args)
			const messagesAfterExisting =
				resultAfterExisting?.messages || args.messages

			return await engramOnPrepareMessages({
				...args,
				messages: messagesAfterExisting,
			})
		}
	} else if (engramHooks.onPrepareMessages) {
		mergedHooks.onPrepareMessages = engramHooks.onPrepareMessages
	}

	if (existingHooks.onEnd && engramHooks.onEnd) {
		const existingOnEnd = existingHooks.onEnd
		const engramOnEnd = engramHooks.onEnd

		mergedHooks.onEnd = async (args) => {
			await engramOnEnd(args)
			await existingOnEnd(args)
		}
	} else if (engramHooks.onEnd) {
		mergedHooks.onEnd = engramHooks.onEnd
	}

	if (existingHooks.onStart && engramHooks.onStart) {
		const existingOnStart = existingHooks.onStart
		const engramOnStart = engramHooks.onStart

		mergedHooks.onStart = async (args) => {
			await existingOnStart(args)
			await engramOnStart(args)
		}
	} else if (engramHooks.onStart) {
		mergedHooks.onStart = engramHooks.onStart
	}

	return mergedHooks
}
