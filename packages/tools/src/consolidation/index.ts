import { SmaranClient } from "supermemory"
import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { pipeline, env } from "@xenova/transformers"
import { detect_clusters } from "memory-consolidator"

export interface ConsolidationOptions {
	smaranClient: SmaranClient
	openaiApiKey: string
	projectId: string
}

export async function consolidateGraphMemory({
	smaranClient,
	openaiApiKey,
	projectId,
}: ConsolidationOptions) {
	const openai = createOpenAI({ apiKey: openaiApiKey })

	// 1. Fetch memories
	console.log("Fetching memories for project:", projectId)
	const result = await smaranClient.search.memories({
		q: "",
		limit: 100,
		containerTag: projectId,
		searchMode: "hybrid",
	})

	const memories = result.results || []
	if (memories.length < 5) {
		console.log("Not enough memories to cluster.")
		return
	}

	// 2. Generate Embeddings
	console.log("Loading embedding model...")
	env.allowLocalModels = false
	const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")

	console.log(`Generating embeddings for ${memories.length} memories...`)
	const flatEmbeddings: number[] = []
	const memoryIds: string[] = []

	for (const memory of memories) {
		const text =
			memory.content || memory.memory || memory.chunk || memory.context || ""
		if (!text) continue

		const output = await extractor(text, { pooling: "mean", normalize: true })
		flatEmbeddings.push(...Array.from(output.data as Float32Array))
		memoryIds.push(memory.id)
	}

	// 3. Detect Clusters using Louvain WASM
	console.log("Running Louvain clustering...")
	const memoryIdsJson = JSON.stringify(memoryIds)
	const embeddingsArray = new Float32Array(flatEmbeddings)

	const clusterResultStr = detect_clusters(
		memoryIdsJson,
		embeddingsArray,
		384, // dimensions for all-MiniLM-L6-v2
		0.85, // overlap threshold
	)

	const clusterResult = clusterResultStr as any
	console.log(`Found ${clusterResult.clusters?.length || 0} clusters > 3 members.`)

	// 4. Summarize clusters and save
	for (const cluster of clusterResult.clusters || []) {
		const clusterTexts = cluster.member_ids.map((id: string) => {
			const mem = memories.find((m: any) => m.id === id)
			return mem?.content || mem?.memory || mem?.chunk || mem?.context || ""
		})

		console.log(
			`Summarizing cluster ${cluster.id} with ${cluster.member_ids.length} members...`,
		)

		const prompt = `Synthesize the following fragments into a unified, coherent factual summary. Retain important details but remove redundancy.
    
Fragments:
${clusterTexts.map((t: string) => "- " + t).join("\n")}
`

		const { text: summary } = await generateText({
			model: openai("gpt-4o-mini"),
			prompt,
		})

		console.log(`Generated summary: ${summary.slice(0, 100)}...`)

		// 5. Save the summary back
		await smaranClient.add({
			content: summary,
			containerTag: projectId,
			metadata: {
				sm_source: "consolidation",
				clusterId: cluster.id,
				memberCount: cluster.member_ids.length,
			},
		})
	}

	return clusterResult
}
