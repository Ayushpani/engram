# engram AI SDK Utilities

Vercel AI SDK utilities for engram

## Installation

```bash
npm install @engram/ai-sdk
# or
bun add @engram/ai-sdk
# or
pnpm add @engram/ai-sdk
# or
yarn add @engram/ai-sdk
```

## Features

Choose **one** of the following approaches (they cannot be used together):

- **Infinite Chat Provider**: Connect to various LLM providers with unlimited context support
- **Memory Tools**: Search, add, and fetch memories from engram using AI agents

## Infinite Chat Provider

The infinite chat provider allows you to connect to various LLM providers with engram's context management.

```typescript
import { generateText } from 'ai'

// Using a custom provider URL
const engramOpenai = createOpenAI({
  baseUrl: 'https://api.engram.ai/v3/https://api.openai.com/v1',
  apiKey: 'your-provider-api-key',
  headers: {
    'x-engram-api-key': 'engram-api-key',
    'x-sm-conversation-id': 'conversation-id'
  }
})

const result = await generateText({
  model: engramOpenai('gpt-5'),
  messages: [
    { role: 'user', content: 'Hello, how are you?' }
  ]
})
```

### Complete Infinite Chat Example

```typescript
import { generateText } from 'ai'

const engramApiKey = process.env.ENGRAM_API_KEY!
const openaiApiKey = process.env.OPENAI_API_KEY!

// Initialize infinite chat provider
const engramOpenai = createOpenAI({
  baseUrl: 'https://api.engram.ai/v3/https://api.openai.com/v1',
  apiKey: 'your-provider-api-key',
  headers: {
    'x-engram-api-key': 'engram-api-key',
    'x-sm-conversation-id': 'conversation-id'
  }
})

async function chat(userMessage: string) {
  const result = await generateText({
    model: engramOpenai('gpt-5'),
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant with unlimited context.'
      },
      {
        role: 'user',
        content: userMessage
      }
    ]
    // No tools - infinite chat handles context automatically
  })

  return result.text
}
```

### Configuration

```typescript
// Option 1: Use a named provider
interface ConfigWithProviderName {
  providerName: 'openai' | 'anthropic' | 'openrouter' | 'deepinfra' | 'groq' | 'google' | 'cloudflare'
  providerApiKey: string
  headers?: Record<string, string>
}

// Option 2: Use a custom provider URL
interface ConfigWithProviderUrl {
  providerUrl: string
  providerApiKey: string
  headers?: Record<string, string>
}
```

## Memory Tools

engram tools allow AI agents to interact with user memories for enhanced context and personalization.

```typescript
import { engramTools } from '@engram/ai-sdk'
import { generateText } from 'ai'

const result = await generateText({
  model: openai('gpt-5'),
  messages: [
    { role: 'user', content: 'What do you remember about my preferences?' }
  ],
  tools: {
    ...engramTools('your-engram-api-key', {
  // Optional: specify a base URL for self-hosted instances
  baseUrl: 'https://api.engram.com',

  // Use either projectId OR containerTags, not both
  projectId: 'your-project-id',
  // OR
  containerTags: ['tag1', 'tag2']
}),
// Your other tools go here
  }
})
```

### Complete Memory Tools Example

```typescript
import { engramTools } from '@engram/ai-sdk'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

const engramApiKey = process.env.ENGRAM_API_KEY!

async function chatWithTools(userMessage: string) {
  const result = await generateText({
    model: openai('gpt-5'), // Use standard provider
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant with access to user memories.'
      },
      {
        role: 'user',
        content: userMessage
      }
    ],
    tools: {
      ...engramTools(engramApiKey, {
        containerTags: ['my-user-id']
      })
    },
    maxToolRoundtrips: 5
  })

  return result.text
}
```

### Configuration

```typescript
interface EngramConfig {
  // Optional: Base URL for API calls (default: https://api.engram.com)
  baseUrl?: string

  // Container tags for organizing memories (cannot be used with projectId)
  containerTags?: string[]

  // Project ID for scoping memories (cannot be used with containerTags)
  projectId?: string
}
```

### Self-Hosted engram

If you're running a self-hosted engram instance:

```typescript
const tools = engramTools('your-api-key', {
  baseUrl: 'https://your-engram-instance.com',
  containerTags: ['production', 'user-memories']
})
```

### Available Tools

##### Search Memories

Search through user memories using semantic matching.

```typescript
const searchResult = await tools.searchMemories.execute({
  informationToGet: 'user preferences about coffee'
})
```

##### Add Memory

Add new memories to the user's memory store.

```typescript
const addResult = await tools.addMemory.execute({
  memory: 'User prefers dark roast coffee in the morning'
})
```

##### Fetch Memory

Retrieve a specific memory by its ID.

```typescript
const fetchResult = await tools.fetchMemory.execute({
  memoryId: 'memory-id-123'
})
```

### Using Individual Tools

For more flexibility, you can import and use individual tools:

```typescript
import {
  searchMemoriesTool,
  addMemoryTool,
  fetchMemoryTool
} from '@engram/ai-sdk'

const searchTool = searchMemoriesTool('your-api-key', {
  projectId: 'your-project-id'
})

// Use only the search tool
const result = await generateText({
  model: openai('gpt-5'),
  messages: [...],
  tools: {
    searchMemories: searchTool
  }
})
```

### Error Handling

All tool executions return a result object with a `success` field:

```typescript
const result = await tools.searchMemories.execute({
  informationToGet: 'user preferences'
})

if (result.success) {
  console.log('Found memories:', result.results)
  console.log('Total count:', result.count)
} else {
  console.error('Error searching memories:', result.error)
}
```

## Development

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch
```

#### Environment Variables for Tests

All tests require API keys to run. Copy `.env.example` to `.env` and set the required values:

```bash
cp .env.example .env
```

**Required:**
- `ENGRAM_API_KEY`: Your Engram API key
- `PROVIDER_API_KEY`: Your AI provider API key (OpenAI, Anthropic, etc.)
- `OPENAI_API_KEY`: Your OpenAI API key for tool integration tests

**Optional:**
- `ENGRAM_BASE_URL`: Custom Engram base URL (defaults to `https://api.engram.ai`)
- `PROVIDER_NAME`: Provider name (defaults to `openai`) - one of: `openai`, `anthropic`, `openrouter`, `deepinfra`, `groq`, `google`, `cloudflare`
- `PROVIDER_URL`: Custom provider URL (use instead of `PROVIDER_NAME`)
- `MODEL_NAME`: Model to use in tests (defaults to `gpt-3.5-turbo`)

Tests will fail if required API keys are not provided.

## License

MIT

## Support

Email our [24/7 Founder/CEO/Support Executive](dhravya@engram.com)
