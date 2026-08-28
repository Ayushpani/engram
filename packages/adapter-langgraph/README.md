# `@repo/adapter-langgraph`

Memory nodes and tool schemas for [LangGraph.js](https://langchain-ai.github.io/langgraphjs/).
Use them in a `StateGraph` — either as tool-execution nodes the LLM
routes to, or as a silent `recallNode` prepended to the LLM step.

```ts
import { StateGraph, START, END } from "@langchain/langgraph"
import { Smaran } from "@repo/sdk-ts"
import {
	memoryToolNodes,
	memoryToolSchemas,
	recallNode,
} from "@repo/adapter-langgraph"

const memory = new Smaran({ apiKey: process.env.SMARAN_API_KEY! })
const scope = { userId: "u_123", sessionId: "sess_abc" }

const graph = new StateGraph({ channels: { messages: { value: (a, b) => b } } })
	.addNode("recall", recallNode(memory, { ...scope, topK: 5 }))
	.addNode("llm", myLLMNode(memoryToolSchemas()))
	.addNode("memory_save", memoryToolNodes(memory, scope).memory_save)
	.addNode("memory_recall", memoryToolNodes(memory, scope).memory_recall)
	.addEdge(START, "recall")
	.addEdge("recall", "llm")
	.addConditionalEdges("llm", routeToolCall, {
		memory_save: "memory_save",
		memory_recall: "memory_recall",
		end: END,
	})
	.addEdge("memory_save", "llm")
	.addEdge("memory_recall", "llm")
```
