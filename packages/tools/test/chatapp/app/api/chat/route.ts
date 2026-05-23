import { gateway, streamText, type ModelMessage } from "ai"
import { withEngram } from "@engram/tools/ai-sdk"

const model = withEngram(gateway("google/gemini-2.5-flash"), {
	containerTag: "user-1",
	customId: "chat-session",
	apiKey: process.env.ENGRAM_API_KEY ?? "",
	mode: "full",
	addMemory: "always",
	baseUrl: process.env.ENGRAM_BASE_URL,
})

export async function POST(req: Request) {
	const { messages }: { messages: ModelMessage[] } = await req.json()

	const result = streamText({
		model,
		system: "You are a helpful assistant.",
		messages,
	})

	return result.toUIMessageStreamResponse()
}
