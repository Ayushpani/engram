# Smaran Microsoft Agent Framework SDK

Memory tools and middleware for [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) with [Smaran](https://smaran.ai) integration.

This package provides both **automatic memory injection middleware** and **manual memory tools** for the Microsoft Agent Framework.

## Installation

Install using uv (recommended):

```bash
uv add --prerelease=allow smaran-agent-framework
```

Or with pip:

```bash
pip install --pre smaran-agent-framework
```

> **Note:** The `--prerelease=allow` / `--pre` flag is required because `agent-framework-core` depends on pre-release versions of Azure packages.

For async HTTP support (recommended):

```bash
uv add smaran-agent-framework[async]
# or
pip install smaran-agent-framework[async]
```

## Quick Start

### Automatic Memory Injection (Recommended)

The easiest way to add memory capabilities is using the `SmaranChatMiddleware`:

```python
import asyncio
from agent_framework.openai import OpenAIResponsesClient
from smaran_agent_framework import (
    SmaranChatMiddleware,
    SmaranMiddlewareOptions,
)

async def main():
    # Create Smaran middleware
    middleware = SmaranChatMiddleware(
        container_tag="user-123",
        options=SmaranMiddlewareOptions(
            mode="full",        # "profile", "query", or "full"
            verbose=True,       # Enable logging
            add_memory="always" # Automatically save conversations
        ),
    )

    # Create agent with middleware
    agent = OpenAIResponsesClient().as_agent(
        name="MemoryAgent",
        instructions="You are a helpful assistant with memory.",
        middleware=[middleware],
    )

    # Use normally - memories are automatically injected!
    response = await agent.run(
        "What's my favorite programming language?"
    )
    print(response.text)

asyncio.run(main())
```

### Context Provider (Recommended for Sessions)

The most idiomatic way to add memory in Agent Framework, using the same pattern as the built-in Mem0 integration:

```python
import asyncio
from agent_framework import AgentSession
from agent_framework.openai import OpenAIResponsesClient
from smaran_agent_framework import SmaranContextProvider

async def main():
    # Create context provider
    provider = SmaranContextProvider(
        container_tag="user-123",
        api_key="your-smaran-api-key",
        mode="full",
        store_conversations=True,
    )

    # Create agent with context provider
    agent = OpenAIResponsesClient().as_agent(
        name="MemoryAgent",
        instructions="You are a helpful assistant with memory.",
        context_providers=[provider],
    )

    # Use with a session - memories are automatically fetched and injected
    session = AgentSession()
    response = await agent.run(
        "What's my favorite programming language?",
        session=session,
    )
    print(response.text)

asyncio.run(main())
```

### Using Memory Tools

For explicit tool-based memory access:

```python
import asyncio
from agent_framework.openai import OpenAIResponsesClient
from smaran_agent_framework import SmaranTools

async def main():
    # Create memory tools
    tools = SmaranTools(
        api_key="your-smaran-api-key",
        config={"project_id": "my-project"},
    )

    # Create agent
    agent = OpenAIResponsesClient().as_agent(
        name="MemoryAgent",
        instructions="You are a helpful assistant with access to user memories.",
    )

    # Run with memory tools
    response = await agent.run(
        "Remember that I prefer tea over coffee",
        tools=tools.get_tools(),
    )
    print(response.text)

asyncio.run(main())
```

### Combining Middleware and Tools

For maximum flexibility, use both middleware (automatic context injection) and tools (explicit memory operations):

```python
import asyncio
from agent_framework.openai import OpenAIResponsesClient
from smaran_agent_framework import (
    SmaranChatMiddleware,
    SmaranMiddlewareOptions,
    SmaranTools,
)

async def main():
    api_key = "your-smaran-api-key"

    middleware = SmaranChatMiddleware(
        container_tag="user-123",
        options=SmaranMiddlewareOptions(mode="full"),
        api_key=api_key,
    )

    tools = SmaranTools(api_key=api_key)

    agent = OpenAIResponsesClient().as_agent(
        name="MemoryAgent",
        instructions="You are a helpful assistant with memory.",
        middleware=[middleware],
    )

    # Middleware injects context automatically,
    # tools let the agent explicitly search/add memories
    response = await agent.run(
        "What do you remember about me?",
        tools=tools.get_tools(),
    )
    print(response.text)

asyncio.run(main())
```

## Middleware Configuration

### Memory Modes

#### `"profile"` mode (default)
Injects all static and dynamic profile memories into every request.

```python
SmaranMiddlewareOptions(mode="profile")
```

#### `"query"` mode
Searches for memories relevant to the current user message.

```python
SmaranMiddlewareOptions(mode="query")
```

#### `"full"` mode
Combines both profile and query modes.

```python
SmaranMiddlewareOptions(mode="full")
```

### Memory Storage

```python
# Always save conversations as memories
SmaranMiddlewareOptions(add_memory="always")

# Never save conversations (default)
SmaranMiddlewareOptions(add_memory="never")
```

### Complete Configuration

```python
SmaranMiddlewareOptions(
    conversation_id="chat-session-456",  # Group messages into conversations
    verbose=True,                        # Enable detailed logging
    mode="full",                         # Use both profile and query
    add_memory="always"                  # Auto-save conversations
)
```

## API Reference

### SmaranTools

Memory tools that integrate with Agent Framework's tool system.

```python
tools = SmaranTools(
    api_key="your-api-key",
    config={
        "project_id": "my-project",       # or use container_tags
        "base_url": "https://custom.com", # optional
    }
)

# Get FunctionTool instances for Agent.run()
agent_tools = tools.get_tools()

# Or use directly
result = await tools.search_memories("user preferences")
result = await tools.add_memory("User prefers dark mode")
result = await tools.get_profile()
```

### SmaranChatMiddleware

Chat middleware for automatic memory injection.

```python
middleware = SmaranChatMiddleware(
    container_tag="user-123",           # Memory scope identifier
    options=SmaranMiddlewareOptions(...),
    api_key="your-api-key",             # Or set SMARAN_API_KEY env var
)
```

### with_smaran_middleware()

Convenience function for creating middleware:

```python
middleware = with_smaran_middleware(
    "user-123",
    SmaranMiddlewareOptions(mode="full"),
)
```

### SmaranContextProvider

Context provider for the Agent Framework session pipeline (like Mem0):

```python
provider = SmaranContextProvider(
    container_tag="user-123",
    api_key="your-api-key",           # Or set SMARAN_API_KEY env var
    mode="full",                      # "profile", "query", or "full"
    store_conversations=True,         # Save conversations after each run
    conversation_id="chat-456",       # Optional grouping ID
    context_prompt="## Memories\n...",  # Custom header for injected memories
    verbose=True,                     # Enable logging
)
```

## Error Handling

```python
from smaran_agent_framework import (
    SmaranConfigurationError,
    SmaranAPIError,
    SmaranNetworkError,
    SmaranMemoryOperationError,
)

try:
    middleware = SmaranChatMiddleware("user-123")
except SmaranConfigurationError as e:
    print(f"Configuration issue: {e}")
```

### Exception Types

- **`SmaranError`** - Base class for all Smaran exceptions
- **`SmaranConfigurationError`** - Missing API keys, invalid configuration
- **`SmaranAPIError`** - API request failures (includes status codes)
- **`SmaranNetworkError`** - Network connectivity issues
- **`SmaranMemoryOperationError`** - Memory search/add operation failures
- **`SmaranTimeoutError`** - Operation timeouts

## Environment Variables

- `SMARAN_API_KEY` - Your Smaran API key (required)
- `OPENAI_API_KEY` - Your OpenAI API key (required for OpenAI-based agents)

## Dependencies

### Required
- `agent-framework-core>=1.0.0rc3` - Microsoft Agent Framework
- `smaran>=3.1.0` - Smaran client
- `requests>=2.25.0` - HTTP requests (fallback)

### Optional
- `aiohttp>=3.8.0` - Async HTTP requests (recommended)

## Development

```bash
# Setup
cd packages/agent-framework-python
uv sync --dev

# Run tests
uv run pytest

# Type checking
uv run mypy src/smaran_agent_framework

# Formatting
uv run black src/ tests/
uv run isort src/ tests/
```

## License

MIT License - see LICENSE file for details.

## Links

- [Smaran](https://smaran.ai) - Infinite context memory platform
- [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) - AI agent framework
- [Documentation](https://docs.smaran.ai) - Full API documentation
