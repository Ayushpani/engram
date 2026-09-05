# smaran-openai-sdk

Memory tools and middleware for the official [OpenAI Python SDK](https://github.com/openai/openai-python) with [Smaran](https://github.com/Ayushpani/smaran).

## Installation

```bash
pip install smaran-openai-sdk
```

## Quick Start

### Automatic memory injection

```python
import asyncio
from openai import AsyncOpenAI
from smaran_openai import with_smaran, OpenAIMiddlewareOptions

async def main():
    openai = AsyncOpenAI(api_key="your-openai-api-key")

    openai_with_memory = with_smaran(
        openai,
        OpenAIMiddlewareOptions(
            user_id="user-123",       # Required: memories are scoped to this
            session_id="chat-123",    # Optional: groups saved messages
            add_memory=True,          # Save the conversation after each call
        ),
        api_key="your-smaran-api-key",       # or set SMARAN_API_KEY
        base_url="https://your-smaran-url",  # or set SMARAN_URL
    )

    response = await openai_with_memory.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "What's my favorite programming language?"}],
    )
    print(response.choices[0].message.content)

asyncio.run(main())
```

### Memory tools (function calling)

```python
import openai
from smaran_openai import SmaranTools, execute_memory_tool_calls

client = openai.AsyncOpenAI(api_key="your-openai-api-key")
tools = SmaranTools("your-smaran-api-key", {"user_id": "user-123"})

response = await client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant with access to user memories."},
        {"role": "user", "content": "Remember that I prefer tea over coffee"},
    ],
    tools=tools.get_tool_definitions(),
)

if response.choices[0].message.tool_calls:
    tool_results = await execute_memory_tool_calls(
        api_key="your-smaran-api-key",
        tool_calls=response.choices[0].message.tool_calls,
        config={"user_id": "user-123"},
    )
```

### Sync client support

```python
from openai import OpenAI
from smaran_openai import with_smaran, OpenAIMiddlewareOptions

openai = OpenAI(api_key="your-openai-api-key")
openai_with_memory = with_smaran(openai, OpenAIMiddlewareOptions(user_id="user-123"))

response = openai_with_memory.chat.completions.create(
    model="gpt-4", messages=[{"role": "user", "content": "Hello!"}]
)
```

If called from within a running event loop, the sync path falls back to a
thread pool for the recall/save calls — the same interface either way.

### Background task cleanup

When `add_memory=True`, saving happens as a background task so it doesn't
add latency to the reply. Wait for it explicitly, or use the async context
manager:

```python
async with with_smaran(openai, OpenAIMiddlewareOptions(user_id="user-123")) as client:
    response = await client.chat.completions.create(...)
# background save tasks are awaited on exit

# or manually:
client = with_smaran(openai, OpenAIMiddlewareOptions(user_id="user-123"))
response = await client.chat.completions.create(...)
await client.wait_for_background_tasks()
```

## Configuration

```python
@dataclass
class OpenAIMiddlewareOptions:
    user_id: str                    # Required: memory scope
    session_id: Optional[str] = None  # Groups saved messages into one conversation
    verbose: bool = False
    add_memory: bool = True         # Save the conversation after each call
    search_limit: int = 5           # Max memories recalled per turn
```

## SmaranTools

```python
from smaran_openai import SmaranTools

tools = SmaranTools(
    "your-smaran-api-key",
    {"user_id": "user-123", "session_id": "chat-456", "base_url": "https://custom.example"},
)

result = await tools.search_memories(information_to_get="user preferences", limit=5)
result = await tools.add_memory(memory="User prefers tea over coffee")
```

Or use the individual-tool helpers (`create_search_memories_tool`,
`create_add_memory_tool`) if you want each as its own object.

## Error Handling

```python
from smaran_openai import (
    SmaranConfigurationError,
    SmaranAPIError,
    SmaranNetworkError,
    SmaranMemoryOperationError,
)

try:
    client = with_smaran(openai_client, OpenAIMiddlewareOptions(user_id="user-123"))
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
cd packages/openai-sdk-python
uv sync --dev
uv run pytest
```

## License

MIT
