import { convertToModelMessages, gateway, streamText, type UIMessage } from "ai"
import { withTracing } from "@posthog/ai"
import { withSmaran } from "../../../../../src/ai-sdk"
import { PostHog } from "posthog-node"

const SMARAN_USER_ID = "user-1"

const gatewayModel = gateway("google/gemini-2.5-flash")

const smaranOptions = {
	containerTag: SMARAN_USER_ID,
	customId: "stream-session",
	apiKey: process.env.SMARAN_API_KEY ?? "",
	mode: "full" as const,
	addMemory: "always" as const,
	baseUrl: process.env.SMARAN_BASE_URL,
}

export async function POST(req: Request) {
	const { messages }: { messages: UIMessage[] } = await req.json()

	const posthogApiKey = process.env.POSTHOG_API_KEY
	const phClient = posthogApiKey
		? new PostHog(posthogApiKey, {
				host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
			})
		: null

	const innerModel = phClient
		? withTracing(gatewayModel, phClient, {
				posthogDistinctId: SMARAN_USER_ID,
				posthogProperties: { route: "api/stream" },
			})
		: gatewayModel

	const model = withSmaran(innerModel, smaranOptions)

	const result = streamText({
		model,
		system: "You are a helpful assistant.",
		messages: await convertToModelMessages(messages),
		onFinish: phClient
			? async () => {
					await phClient.shutdown()
				}
			: undefined,
	})

	return result.toUIMessageStreamResponse()
}
