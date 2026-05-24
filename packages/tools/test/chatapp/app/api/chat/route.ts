import { gateway, streamText, type ModelMessage } from "ai"
import { withSmaran } from "@smaran/tools/ai-sdk"

const model = withSmaran(gateway("google/gemini-2.5-flash"), {
	containerTag: "user-1",
	customId: "chat-session",
	apiKey: process.env.SMARAN_API_KEY ?? "",
	mode: "full",
	addMemory: "always",
	baseUrl: process.env.SMARAN_BASE_URL,
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
