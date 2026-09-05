"""Manual smoke test — chat with a memory-enabled agent from the terminal.

Requires SMARAN_API_KEY, SMARAN_URL, and OPENAI_API_KEY in the environment.
Not part of the pytest suite.
"""

import asyncio
import os

from agent_framework.openai import OpenAIResponsesClient

from smaran_agent_framework import AgentSmaran, SmaranChatMiddleware, SmaranMiddlewareOptions, SmaranTools


async def main():
    conn = AgentSmaran(
        api_key=os.environ["SMARAN_API_KEY"],
        base_url=os.environ["SMARAN_URL"],
        user_id="test-user-123",
    )

    middleware = SmaranChatMiddleware(
        conn,
        options=SmaranMiddlewareOptions(verbose=True, save_conversations=True),
    )

    tools = SmaranTools(conn)

    agent = OpenAIResponsesClient(api_key=os.environ["OPENAI_API_KEY"], model_id="gpt-4o-mini").as_agent(
        name="MemoryAgent",
        instructions="You are a helpful assistant with memory.",
        middleware=[middleware],
        tools=tools.get_tools(),
    )

    print("Chat with the agent (type 'quit' to exit)")
    print("-" * 40)

    while True:
        try:
            user_input = input("\nYou: ")
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if user_input.strip().lower() in ("quit", "exit"):
            print("Bye!")
            break

        response = await agent.run(user_input)
        print(f"\nAgent: {response.text}")


asyncio.run(main())
