# @engram/tools

Memory tools for AI SDK, OpenAI, and Mastra with engram

This package provides engram tools for AI SDK, OpenAI, and Mastra through dedicated submodule exports, each with function-based architectures optimized for their respective use cases.

## Installation

```bash
npm install @engram/tools
```

## Usage

The package provides three submodule imports:
- `@engram/tools/ai-sdk` - For use with the AI SDK framework (includes `withEngram` middleware)
- `@engram/tools/openai` - For use with OpenAI SDK (includes `withEngram` middleware and function calling tools)
- `@engram/tools/mastra` - For use with Mastra AI agents (includes `withEngram` wrapper and processors)

### AI SDK Usage

```typescript
import { engramTools, searchMemoriesTool, addMemoryTool } from "@engram/tools/ai-sdk"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Create all tools
const tools = engramTools(process.env.ENGRAM_API_KEY!, {
  containerTags: ["your-user-id"],
})

// Use with AI SDK
const result = await generateText({
  model: openai("gpt-5"),
  messages: [
    {
      role: "user",
      content: "What do you remember about my preferences?",
    },
  ],
  tools,
})

// Or create individual tools
const searchTool = searchMemoriesTool(process.env.ENGRAM_API_KEY!, {
  projectId: "your-project-id",
})

const addTool = addMemoryTool(process.env.ENGRAM_API_KEY!, {
  projectId: "your-project-id",
})
```

#### AI SDK Middleware with Engram

- `withEngram` will take advantage engram profile v4 endpoint personalized based on container tag
- You can provide the Engram API key via the `apiKey` option to `withEngram` (recommended for browser usage), or fall back to `ENGRAM_API_KEY` in the environment for server usage.
- **Per-turn caching**: Memory injection is cached for tool-call continuations within the same user turn. The middleware detects when the AI SDK is continuing a multi-step flow (e.g., after a tool call) and reuses the cached memories instead of making redundant API calls. A fresh fetch occurs on each new user message turn.

```typescript
import { generateText } from "ai"
import { withEngram } from "@engram/tools/ai-sdk"
import { openai } from "@ai-sdk/openai"

const modelWithMemory = withEngram(openai("gpt-5"), {
	containerTag: "user_id_life",
	customId: "conversation-456",
})

const result = await generateText({
	model: modelWithMemory,
	messages: [{ role: "user", content: "where do i live?" }],
})

console.log(result.text)
```

#### Verbose Mode

Enable verbose logging to see detailed information about memory search and transformation:

```typescript
import { generateText } from "ai"
import { withEngram } from "@engram/tools/ai-sdk"
import { openai } from "@ai-sdk/openai"

const modelWithMemory = withEngram(openai("gpt-5"), {
	containerTag: "user_id_life",
	customId: "conversation-456",
	verbose: true,
})

const result = await generateText({
	model: modelWithMemory,
	messages: [{ role: "user", content: "where do i live?" }],
})

console.log(result.text)
```

When verbose mode is enabled, you'll see console output like:
```
[engram] Searching memories for container: user_id_life
[engram] User message: where do i live?
[engram] System prompt exists: false
[engram] Found 3 memories
[engram] Memory content: You live in San Francisco, California. Your address is 123 Main Street...
[engram] Creating new system prompt with memories
```

#### Memory Search Modes

The middleware supports different modes for memory retrieval:

**Profile Mode (Default)** - Retrieves user profile memories without query filtering:
```typescript
import { generateText } from "ai"
import { withEngram } from "@engram/tools/ai-sdk"
import { openai } from "@ai-sdk/openai"

// Uses profile mode by default - gets all user profile memories
const modelWithMemory = withEngram(openai("gpt-4"), {
  containerTag: "user-123",
  customId: "conversation-456",
})

// Explicitly specify profile mode
const modelWithProfile = withEngram(openai("gpt-4"), {
  containerTag: "user-123",
  customId: "conversation-456",
  mode: "profile",
})

const result = await generateText({
  model: modelWithMemory,
  messages: [{ role: "user", content: "What do you know about me?" }],
})
```

**Query Mode** - Searches memories based on the user's message:
```typescript
import { generateText } from "ai"
import { withEngram } from "@engram/tools/ai-sdk"
import { openai } from "@ai-sdk/openai"

const modelWithQuery = withEngram(openai("gpt-4"), {
  containerTag: "user-123",
  customId: "conversation-456",
  mode: "query",
})

const result = await generateText({
  model: modelWithQuery,
  messages: [{ role: "user", content: "What's my favorite programming language?" }],
})
```

**Full Mode** - Combines both profile and query results:
```typescript
import { generateText } from "ai"
import { withEngram } from "@engram/tools/ai-sdk"
import { openai } from "@ai-sdk/openai"

const modelWithFull = withEngram(openai("gpt-4"), {
  containerTag: "user-123",
  customId: "conversation-456",
  mode: "full",
})

const result = await generateText({
  model: modelWithFull,
  messages: [{ role: "user", content: "Tell me about my preferences" }],
})
```

#### Automatic Memory Capture

The middleware can automatically save user messages as memories:

**Always Save Memories** - Automatically stores every user message as a memory:
```typescript
import { generateText } from "ai"
import { withEngram } from "@engram/tools/ai-sdk"
import { openai } from "@ai-sdk/openai"

const modelWithAutoSave = withEngram(openai("gpt-4"), {
  containerTag: "user-123",
  customId: "conversation-456",
  addMemory: "always",
})

const result = await generateText({
  model: modelWithAutoSave,
  messages: [{ role: "user", content: "I prefer React with TypeScript for my projects" }],
})
// This message will be automatically saved as a memory
```

**Never Save Memories** - Only retrieves memories without storing new ones:
```typescript
const modelWithNoSave = withEngram(openai("gpt-4"), {
  containerTag: "user-123",
  customId: "conversation-456",
  addMemory: "never",  // explicit since default is now "always"
})
```

**Combined Options** - Use verbose logging with specific modes and memory storage:
```typescript
const modelWithOptions = withEngram(openai("gpt-4"), {
  containerTag: "user-123",
  customId: "conversation-456",
  mode: "profile",
  addMemory: "always",
  verbose: true,
})
```

#### Custom Prompt Templates

Customize how memories are formatted and injected into the system prompt using the `promptTemplate` option. This is useful for:
- Using XML-based prompting (e.g., for Claude models)
- Custom branding (removing "supermemories" references)
- Controlling how your agent describes where information comes from

```typescript
import { generateText } from "ai"
import { withEngram, type MemoryPromptData } from "@engram/tools/ai-sdk"
import { openai } from "@ai-sdk/openai"

const customPrompt = (data: MemoryPromptData) => `
<user_memories>
Here is some information about your past conversations with the user:
${data.userMemories}
${data.generalSearchMemories}
</user_memories>
`.trim()

const modelWithCustomPrompt = withEngram(openai("gpt-4"), {
  containerTag: "user-123",
  customId: "conversation-456",
  mode: "full",
  promptTemplate: customPrompt,
})

const result = await generateText({
  model: modelWithCustomPrompt,
  messages: [{ role: "user", content: "What do you know about me?" }],
})
```

The `MemoryPromptData` object provides:
- `userMemories`: Pre-formatted markdown combining static profile facts (name, preferences, goals) and dynamic context (current projects, recent interests)
- `generalSearchMemories`: Pre-formatted search results based on semantic similarity to the current query
- `searchResults`: Raw search results array for traversing, filtering, or selectively including results based on metadata

### OpenAI SDK Usage

#### OpenAI Middleware with Engram

The `withEngram` function creates an OpenAI client with SuperMemory middleware automatically injected:

```typescript
import { withEngram } from "@engram/tools/openai"

// Create OpenAI client with engram middleware
const openaiWithEngram = withEngram(openai, {
  containerTag: "user-123",      // Required: identifies the user/container
  customId: "conversation-456",  // Required: groups messages into the same document 
  mode: "full",
  addMemory: "always",           // Default: "always"
  verbose: true,
})

// Use directly with chat completions - memories are automatically injected
const completion = await openaiWithEngram.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "user", content: "What do you remember about my preferences?" }
  ],
})

console.log(completion.choices[0]?.message?.content)
```

#### OpenAI Middleware Options

The middleware supports the same configuration options as the AI SDK version:

```typescript
const openaiWithEngram = withEngram(openai, {
  containerTag: "user-123",      // Required: identifies the user/container
  customId: "conversation-456",  // Required: groups messages for contextual memory
  mode: "full",                  // "profile" | "query" | "full"
  addMemory: "always",           // "always" (default) | "never"
  verbose: true,                 // Enable detailed logging
})
```

#### Next.js API Route Example

Here's a complete example for a Next.js API route:

```typescript
// app/api/chat/route.ts
import { withEngram } from "@engram/tools/openai"
import type { OpenAI as OpenAIType } from "openai"

export async function POST(req: Request) {
  const { messages, conversationId } = (await req.json()) as {
    messages: OpenAIType.Chat.Completions.ChatCompletionMessageParam[]
    conversationId: string
  }

  const openaiWithEngram = withEngram(openai, {
    containerTag: "user-123",
    customId: conversationId,
    mode: "full",
    addMemory: "always",
    verbose: true,
  })

  const completion = await openaiWithEngram.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  })

  const message = completion.choices?.[0]?.message
  return Response.json({ message, usage: completion.usage })
}
```

### OpenAI Function Calling Usage

```typescript
import { engramTools, getToolDefinitions, createToolCallExecutor } from "@engram/tools/openai"
import OpenAI from "openai"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Get tool definitions for OpenAI
const toolDefinitions = getToolDefinitions()

// Create tool executor
const executeToolCall = createToolCallExecutor(process.env.ENGRAM_API_KEY!, {
  projectId: "your-project-id",
})

// Use with OpenAI Chat Completions
const completion = await client.chat.completions.create({
  model: "gpt-5",
  messages: [
    {
      role: "user",
      content: "What do you remember about my preferences?",
    },
  ],
  tools: toolDefinitions,
})

// Execute tool calls if any
if (completion.choices[0]?.message.tool_calls) {
  for (const toolCall of completion.choices[0].message.tool_calls) {
    const result = await executeToolCall(toolCall)
    console.log(result)
  }
}

// Or create individual function-based tools
const tools = engramTools(process.env.ENGRAM_API_KEY!, {
  containerTags: ["your-user-id"],
})

const searchResult = await tools.searchMemories({
  informationToGet: "user preferences",
  limit: 10,
})

const addResult = await tools.addMemory({
  memory: "User prefers dark roast coffee",
})
```

### Mastra Usage

Add persistent memory to [Mastra](https://mastra.ai) AI agents. The integration provides processors that:
- **Input Processor**: Fetches relevant memories and injects them into the system prompt before LLM calls
- **Output Processor**: Saves conversations to Engram after responses (enabled by default)

#### Quick Start with `withEngram` Wrapper

The simplest way to add memory to a Mastra agent - wrap your config before creating the Agent:

```typescript
import { Agent } from "@mastra/core/agent"
import { withEngram } from "@engram/tools/mastra"
import { openai } from "@ai-sdk/openai"

// Create agent with memory-enhanced config
const agent = new Agent(withEngram(
  {
    id: "my-assistant",
    name: "My Assistant",
    model: openai("gpt-4o"),
    instructions: "You are a helpful assistant.",
  },
  {
    containerTag: "user-123",  // Required: scopes memories to this user
    customId: "conv-456",      // Required: groups messages for contextual memory
    mode: "full",
  }
))

const response = await agent.generate("What do you know about me?")
console.log(response.text)
```

#### Direct Processor Usage

For fine-grained control, use processors directly:

```typescript
import { Agent } from "@mastra/core/agent"
import { createEngramProcessors } from "@engram/tools/mastra"
import { openai } from "@ai-sdk/openai"

const { input, output } = createEngramProcessors({
  containerTag: "user-123",
  customId: "conv-456",
  mode: "full",
  verbose: true, // Enable logging
})

const agent = new Agent({
  id: "my-assistant",
  name: "My Assistant",
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant with memory.",
  inputProcessors: [input],
  outputProcessors: [output],
})

const response = await agent.generate("What's my favorite programming language?")
```

#### Complete Example

Here's a full example showing a multi-turn conversation with memory:

```typescript
import { Agent } from "@mastra/core/agent"
import { createEngramProcessors } from "@engram/tools/mastra"
import { openai } from "@ai-sdk/openai"

async function main() {
  const userId = "user-alex-123"
  const customId = `thread-${Date.now()}`

  const { input, output } = createEngramProcessors({
    containerTag: userId,
    customId,
    mode: "profile",      // Fetch user profile memories
    verbose: true,
  })

  const agent = new Agent({
    id: "memory-assistant",
    name: "Memory Assistant",
    instructions: `You are a helpful assistant with memory.
Use the memories provided to personalize your responses.`,
    model: openai("gpt-4o-mini"),
    inputProcessors: [input],
    outputProcessors: [output],
  })

  // First conversation - introduce yourself
  console.log("User: Hi! I'm Alex, a TypeScript developer.")
  const r1 = await agent.generate("Hi! I'm Alex, a TypeScript developer.")
  console.log("Assistant:", r1.text)

  // Second conversation - the agent should remember
  console.log("\nUser: What do you know about me?")
  const r2 = await agent.generate("What do you know about me?")
  console.log("Assistant:", r2.text)
}

main()
```

#### Memory Search Modes

- **`profile`** (default): Fetches user profile memories (static facts + dynamic context)
- **`query`**: Searches memories based on the user's message
- **`full`**: Combines both profile and query results

```typescript
// Profile mode - good for general personalization
const { input } = createEngramProcessors({
  containerTag: "user-123",
  customId: "conv-456",
  mode: "profile",
})

// Query mode - good for specific lookups
const { input } = createEngramProcessors({
  containerTag: "user-123",
  customId: "conv-456",
  mode: "query",
})

// Full mode - comprehensive context
const { input } = createEngramProcessors({
  containerTag: "user-123",
  customId: "conv-456",
  mode: "full",
})
```

#### Custom Prompt Templates

Customize how memories are formatted in the system prompt:

```typescript
import { createEngramProcessors, type MemoryPromptData } from "@engram/tools/mastra"

const customTemplate = (data: MemoryPromptData) => `
<user_context>
${data.userMemories}
${data.generalSearchMemories}
</user_context>
`.trim()

const { input, output } = createEngramProcessors({
  containerTag: "user-123",
  customId: "conv-456",
  mode: "full",
  promptTemplate: customTemplate,
})
```

#### Using RequestContext for Dynamic Thread IDs

For server setups where one agent instance handles multiple concurrent conversations, use Mastra's `RequestContext` to provide per-request thread IDs. **RequestContext takes precedence** over the construction-time `customId`:

```typescript
import { Agent } from "@mastra/core/agent"
import { RequestContext, MASTRA_THREAD_ID_KEY } from "@mastra/core/request-context"
import { createEngramProcessors } from "@engram/tools/mastra"

const { input, output } = createEngramProcessors({
  containerTag: "user-123",
  customId: "fallback-conv",  // Used only when RequestContext doesn't provide a threadId
  mode: "profile",
})

const agent = new Agent({
  id: "my-assistant",
  name: "My Assistant",
  model: openai("gpt-4o"),
  inputProcessors: [input],
  outputProcessors: [output],
})

// Per-request threadId takes precedence over customId
const ctx = new RequestContext()
ctx.set(MASTRA_THREAD_ID_KEY, "user-456-session-789")

const response = await agent.generate("Hello!", { requestContext: ctx })
// This conversation is stored under "user-456-session-789", not "fallback-conv"
```

> **Server-side usage**: Always use `RequestContext` to pass unique conversation IDs per request. Using a fixed `customId` for all requests will merge conversations from different users.

#### Mastra Configuration Options

```typescript
interface EngramMastraOptions {
  containerTag: string         // Required: User/container tag for scoping memories
  customId: string             // Required: Groups messages into a single document for contextual memory
  apiKey?: string              // Engram API key (or use ENGRAM_API_KEY env var)
  baseUrl?: string             // Custom API endpoint
  mode?: "profile" | "query" | "full"  // Memory search mode (default: "profile")
  addMemory?: "always" | "never"       // Auto-save conversations (default: "always")
  verbose?: boolean            // Enable debug logging (default: false)
  promptTemplate?: (data: MemoryPromptData) => string  // Custom memory formatting
}
```

## Configuration

Both modules accept the same configuration interface:

```typescript
interface EngramToolsConfig {
  baseUrl?: string
  containerTags?: string[]
  projectId?: string
  strict?: boolean
}
```

- **baseUrl**: Custom base URL for the engram API
- **containerTags**: Array of custom container tags (mutually exclusive with projectId)
- **projectId**: Project ID which gets converted to container tag format (mutually exclusive with containerTags)
- **strict**: Enable strict schema mode for OpenAI strict validation. When `true`, all schema properties are required (satisfies OpenAI strict mode). When `false` (default), optional fields remain optional for maximum compatibility with all models.

### OpenAI Strict Mode Compatibility

When using OpenAI-compatible providers with strict schema validation (e.g., OpenRouter with Azure OpenAI backend), enable strict mode to ensure all schema properties are included in the `required` array:

```typescript
import { searchMemoriesTool, addMemoryTool } from "@engram/tools/ai-sdk"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { streamText } from "ai"

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

const tools = {
  searchMemories: searchMemoriesTool(apiKey, { 
    containerTags: [userId],
    strict: true  // ✅ Required for OpenAI strict mode
  }),
  addMemory: addMemoryTool(apiKey, { 
    containerTags: [userId],
    strict: true
  }),
}

const result = streamText({
  model: openrouter.chat("openai/gpt-5-nano"),
  messages: [...],
  tools,
})
```

Without `strict: true`, optional fields like `includeFullDocs` and `limit` won't be in the `required` array, which will cause validation errors with OpenAI strict mode.

### withEngram Middleware Options

The `withEngram` middleware accepts a configuration object as the second argument:

```typescript
interface WithEngramOptions {
  containerTag: string  // Required: identifies the user/container
  customId: string      // Required: groups messages into the same document 
  verbose?: boolean
  mode?: "profile" | "query" | "full"
  addMemory?: "always" | "never"  // Default: "always"
  /** Optional Engram API key. Use this in browser environments. */
  apiKey?: string
  baseUrl?: string
  promptTemplate?: (data: MemoryPromptData) => string
  skipMemoryOnError?: boolean
}
```

- **containerTag**: Required. The container tag/identifier for memory search (e.g., user ID, project ID)
- **customId**: Required. Custom ID to group messages into a single document for contextual memory generation
- **verbose**: Enable detailed logging of memory search and injection process (default: false)
- **mode**: Memory search mode - "profile" (default), "query", or "full"
- **addMemory**: Automatic memory storage mode - "always" (default) or "never"
- **skipMemoryOnError**: If memory retrieval fails or hits the internal timeout, continue with the original prompt (default: true)

## Available Tools

### Search Memories
Searches through stored memories based on a query string.

**Parameters:**
- `informationToGet` (string): Terms to search for
- `includeFullDocs` (boolean, optional): Whether to include full document content (default: true)
- `limit` (number, optional): Maximum number of results (default: 10)

### Add Memory
Adds a new memory to the system.

**Parameters:**
- `memory` (string): The content to remember



## Claude Memory Tool

Enable Claude to store and retrieve persistent memory across conversations using engram as the backend.

### Installation

```bash
npm install @engram/tools @anthropic-ai/sdk
```

### Basic Usage

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { createClaudeMemoryTool } from '@engram/tools/claude-memory'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const memoryTool = createClaudeMemoryTool(process.env.ENGRAM_API_KEY!, {
  projectId: 'my-app',
})

async function chatWithMemory(userMessage: string) {
  // Send message to Claude with memory tool
  const response = await anthropic.beta.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: userMessage }],
    tools: [{ type: 'memory_20250818', name: 'memory' }],
    betas: ['context-management-2025-06-27'],
  })

  // Handle any memory tool calls
  const toolResults = []
  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'memory') {
      const toolResult = await memoryTool.handleCommandForToolResult(
        block.input,
        block.id
      )
      toolResults.push(toolResult)
    }
  }

  return response
}

// Example usage
const response = await chatWithMemory(
  "Remember that I prefer React with TypeScript for my projects"
)
```

### Memory Operations

Claude can perform these memory operations automatically:

- **`view`** - List memory directory contents or read specific files
- **`create`** - Create new memory files with content
- **`str_replace`** - Find and replace text within memory files
- **`insert`** - Insert text at specific line numbers
- **`delete`** - Delete memory files
- **`rename`** - Rename or move memory files

All memory files are stored in engram with normalized paths and can be searched and retrieved across conversations.

## Environment Variables

```env
ENGRAM_API_KEY=your_engram_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key  # for Claude Memory Tool
ENGRAM_BASE_URL=https://your-custom-url  # optional
```
