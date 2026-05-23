import "dotenv/config"
import { openai } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import {
	withEngram,
	engramTools,
	searchMemoriesTool,
	addMemoryTool,
	type MemoryPromptData,
} from "@engram/tools/ai-sdk"

async function testMiddleware() {
	console.log("=== Middleware ===")

	// Basic wrapper
	const model = withEngram(openai("gpt-4"), {
		containerTag: "user-123",
		customId: "conv-1",
	})
	console.log("✓ withEngram basic")

	// With addMemory option
	const modelWithAdd = withEngram(openai("gpt-4"), {
		containerTag: "user-123",
		customId: "conv-1",
		addMemory: "always",
	})
	console.log("✓ withEngram with addMemory")

	// With verbose logging
	const modelVerbose = withEngram(openai("gpt-4"), {
		containerTag: "user-123",
		customId: "conv-1",
		verbose: true,
	})
	console.log("✓ withEngram with verbose")
}

async function testSearchModes() {
	console.log("\n=== Search Modes ===")

	const profileModel = withEngram(openai("gpt-4"), {
		containerTag: "user-123",
		customId: "conv-1",
		mode: "profile",
	})
	console.log("✓ mode: profile")

	const queryModel = withEngram(openai("gpt-4"), {
		containerTag: "user-123",
		customId: "conv-1",
		mode: "query",
	})
	console.log("✓ mode: query")

	const fullModel = withEngram(openai("gpt-4"), {
		containerTag: "user-123",
		customId: "conv-1",
		mode: "full",
	})
	console.log("✓ mode: full")
}

async function testCustomPrompt() {
	console.log("\n=== Custom Prompt Template ===")

	const anthropic = createAnthropic({ apiKey: "test-key" })

	const claudePrompt = (data: MemoryPromptData) =>
		`
<context>
  <user_profile>${data.userMemories}</user_profile>
  <relevant_memories>${data.generalSearchMemories}</relevant_memories>
</context>
`.trim()

	const model = withEngram(anthropic("claude-3-sonnet-20240229"), {
		containerTag: "user-123",
		customId: "conv-1",
		mode: "full",
		promptTemplate: claudePrompt,
	})
	console.log("✓ Custom prompt template")
}

async function testTools() {
	console.log("\n=== Memory Tools ===")

	// All tools
	const tools = engramTools("YOUR_API_KEY")
	console.log("✓ engramTools")

	// Individual tools
	const searchTool = searchMemoriesTool("API_KEY", { projectId: "personal" })
	console.log("✓ searchMemoriesTool")

	const addTool = addMemoryTool("API_KEY")
	console.log("✓ addMemoryTool")

	// Combined
	const toolsObj = {
		searchMemories: searchTool,
		addMemory: addTool,
	}
	console.log("✓ Combined tools object")
}

async function main() {
	console.log("AI SDK Integration Tests")
	console.log("========================\n")

	await testMiddleware()
	await testSearchModes()
	await testCustomPrompt()
	await testTools()

	console.log("\n========================")
	console.log("✅ All AI SDK tests passed!")
}

main().catch(console.error)
