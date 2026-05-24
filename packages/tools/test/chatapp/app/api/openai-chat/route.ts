import { OpenAI } from "openai"
import { withSmaran } from "@smaran/tools/openai"

export const runtime = "nodejs"

export async function POST(req: Request) {
	const { messages, conversationId } = (await req.json()) as {
		messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
		conversationId: string
	}

	const openai = new OpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	})

	const openaiWithSmaran = withSmaran(openai, {
		containerTag: "user-123",
		customId: conversationId,
		mode: "full",
		addMemory: "always",
		verbose: true,
		baseUrl: process.env.SMARAN_BASE_URL,
	})

	const completion = await openaiWithSmaran.chat.completions.create({
		model: "gpt-4o-mini",
		messages,
	})

	const message = completion.choices?.[0]?.message
	return Response.json({ message, usage: completion.usage })
}
