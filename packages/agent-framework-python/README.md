# smaran-agent-framework

Memory tools and middleware for [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) with [Smaran](https://github.com/Ayushpani/smaran).

Three ways to add memory, usable independently or together:

- **`SmaranChatMiddleware`** — automatically recalls relevant memories and injects them into the system prompt on every call, and can save conversations after.
- **`SmaranContextProvider`** — the idiomatic Agent Framework pattern (same shape as the built-in Mem0 integration), hooking into `before_run`/`after_run` on a session.
- **`SmaranTools`** — explicit `search_memories`/`add_memory` function tools the model can call itself.

## Installation

```bash
pip install smaran-agent-framework
```

## Quick Start

### Chat middleware (recommended for most agents)

```python
import asyncio
from agent_framework.openai import OpenAIResponsesClient
from smaran_agent_framework import AgentSmaran, SmaranChatMiddleware, SmaranMiddlewareOptions

async def main():
    conn = AgentSmaran(
        api_key="your-smaran-api-key",   # or set SMARAN_API_KEY
        base_url="https://your-smaran-deployment",  # or set SMARAN_URL
        user_id="user-123",
    )

    middleware = SmaranChatMiddleware(
        conn,
        options=SmaranMiddlewareOptions(verbose=True, save_conversations=True),
    )

    agent = OpenAIResponsesClient().as_agent(
        name="MemoryAgent",
        instructions="You are a helpful assistant with memory.",
        middleware=[middleware],
    )

    response = await agent.run("What's my favorite programming language?")
    print(response.text)

asyncio.run(main())
```

### Context provider (idiomatic session pattern)

```python
from agent_framework import AgentSession
from agent_framework.openai import OpenAIResponsesClient
from smaran_agent_framework import AgentSmaran, SmaranContextProvider

conn = AgentSmaran(api_key="your-smaran-api-key", user_id="user-123")
provider = SmaranContextProvider(conn, store_conversations=True)

agent = OpenAIResponsesClient().as_agent(
    name="MemoryAgent",
    instructions="You are a helpful assistant with memory.",
    context_providers=[provider],
)

session = AgentSession()
response = await agent.run("What's my favorite programming language?", session=session)
```

### Explicit memory tools

```python
from smaran_agent_framework import AgentSmaran, SmaranTools

conn = AgentSmaran(api_key="your-smaran-api-key", user_id="user-123")
tools = SmaranTools(conn)

response = await agent.run(
    "Remember that I prefer tea over coffee",
    tools=tools.get_tools(),
)
```

All three share the same `AgentSmaran` connection, so middleware/provider/tools can be combined on one agent without duplicating configuration.

## Configuration

```python
SmaranMiddlewareOptions(
    verbose=False,            # Enable detailed logging
    search_limit=5,           # Max memories recalled per turn
    save_conversations=False, # Save the conversation as a memory after each run
)
```

`AgentSmaran` takes `api_key`, `base_url`, `user_id` (memory scope), `entity_context` (static text prepended to every recall), and `conversation_id` (defaults to a random UUID; used to group saved messages).

## Error Handling

```python
from smaran_agent_framework import (
    SmaranConfigurationError,
    SmaranAPIError,
    SmaranNetworkError,
    SmaranMemoryOperationError,
)

try:
    conn = AgentSmaran(user_id="user-123")  # raises if SMARAN_API_KEY/SMARAN_URL are unset
except SmaranConfigurationError as e:
    print(f"Configuration issue: {e}")
```

- **`SmaranError`** — base class for all exceptions here
- **`SmaranConfigurationError`** — missing API key or base URL
- **`SmaranAPIError`** — API request failures (includes status code)
- **`SmaranNetworkError`** — network connectivity issues
- **`SmaranMemoryOperationError`** — recall/save operation failures

## Environment Variables

- `SMARAN_API_KEY` — your Smaran API key
- `SMARAN_URL` — your self-hosted or managed Smaran API base URL

## Development

```bash
cd packages/agent-framework-python
uv sync --dev
uv run pytest
uv run mypy src/smaran_agent_framework
```

## License

MIT
