# AGENTS.md

## Overview

This package adds persistent memory to Pipecat voice AI pipelines using Engram.

**Tech Stack:** Python >=3.10, Pipecat, Engram SDK

## Commands

```bash
pip install engram-pipecat
```

## Integration Pattern

Place `EngramPipecatService` between context aggregator and LLM in the pipeline:

```python
from engram_pipecat import EngramPipecatService

memory = EngramPipecatService(
    user_id="user-123",       # Required: identifies the user
    session_id="session-456", # Optional: groups conversations
)

pipeline = Pipeline([
    transport.input(),
    stt,
    context_aggregator.user(),
    memory,                    # <- Memory service here
    llm,
    tts,
    transport.output(),
    context_aggregator.assistant(),
])
```

## Configuration

```python
memory = EngramPipecatService(
    api_key="...",             # Or use ENGRAM_API_KEY env var
    user_id="user-123",
    session_id="session-456",
    params=EngramPipecatService.InputParams(
        search_limit=10,       # Max memories to retrieve
        search_threshold=0.1,  # Similarity threshold 0.0-1.0
        mode="full",           # "profile" | "query" | "full"
        system_prompt="Based on previous conversations:\n\n",
    ),
)
```

## Memory Modes

| Mode | Retrieves | Use When |
|------|-----------|----------|
| `"profile"` | User profile only | Personalization without search |
| `"query"` | Search results only | Finding relevant past context |
| `"full"` | Profile + search | Complete memory (default) |

## Environment Variables

- `ENGRAM_API_KEY` - Engram API key
- `OPENAI_API_KEY` - For OpenAI services (STT/LLM/TTS)

## Boundaries

- Always place memory service after `context_aggregator.user()` and before `llm`
- Always provide `user_id` - it's required
- Never hardcode API keys in code - use environment variables
