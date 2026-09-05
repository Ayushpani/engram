/**
 * VoltAgent hooks for Smaran integration.
 *
 * Provides onPrepareMessages and onEnd hooks that inject memories
 * and save conversations.
 */

import type {
	VoltAgentHooks,
	HookPrepareMessagesArgs,
	HookEndArgs,
	VoltAgentMessage,
	SmaranVoltAgent,
} from "./types"
import {
	createSmaranContext,
	enhanceMessagesWithMemories,
	saveConversation,
} from "./middleware"

/**
 * Creates Smaran hooks for VoltAgent agents.
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
 * import { createSmaranHooks } from "@smaranai/tools/voltagent"
 *
 * const hooks = createSmaranHooks("user-123", {
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
export function createSmaranHooks(
	containerTag: string,
	options: SmaranVoltAgent,
): VoltAgentHooks {
	const ctx = createSmaranContext(containerTag, options)

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
 * Merges Smaran hooks with existing hooks from an agent config.
 * Preserves existing hooks and adds Smaran hooks.
 *
 * @param existingHooks - Existing hooks from agent config (if any)
 * @param smaranHooks - Smaran hooks to merge
 * @returns Merged hooks object
 */
export function mergeHooks(
	existingHooks: VoltAgentHooks | undefined,
	smaranHooks: VoltAgentHooks,
): VoltAgentHooks {
	if (!existingHooks) {
		return smaranHooks
	}

	const mergedHooks: VoltAgentHooks = { ...existingHooks }

	if (existingHooks.onPrepareMessages && smaranHooks.onPrepareMessages) {
		const existingOnPrepareMessages = existingHooks.onPrepareMessages
		const smaranOnPrepareMessages = smaranHooks.onPrepareMessages

		mergedHooks.onPrepareMessages = async (args) => {
			const resultAfterExisting = await existingOnPrepareMessages(args)
			const messagesAfterExisting =
				resultAfterExisting?.messages || args.messages

			return await smaranOnPrepareMessages({
				...args,
				messages: messagesAfterExisting,
			})
		}
	} else if (smaranHooks.onPrepareMessages) {
		mergedHooks.onPrepareMessages = smaranHooks.onPrepareMessages
	}

	if (existingHooks.onEnd && smaranHooks.onEnd) {
		const existingOnEnd = existingHooks.onEnd
		const smaranOnEnd = smaranHooks.onEnd

		mergedHooks.onEnd = async (args) => {
			await smaranOnEnd(args)
			await existingOnEnd(args)
		}
	} else if (smaranHooks.onEnd) {
		mergedHooks.onEnd = smaranHooks.onEnd
	}

	if (existingHooks.onStart && smaranHooks.onStart) {
		const existingOnStart = existingHooks.onStart
		const smaranOnStart = smaranHooks.onStart

		mergedHooks.onStart = async (args) => {
			await existingOnStart(args)
			await smaranOnStart(args)
		}
	} else if (smaranHooks.onStart) {
		mergedHooks.onStart = smaranHooks.onStart
	}

	return mergedHooks
}
