#!/usr/bin/env python3
"""
Manual integration test for the Smaran OpenAI middleware.

Set your API keys as environment variables to run this against real APIs.
Not part of the pytest suite.
"""

import asyncio
import os

from openai import AsyncOpenAI, OpenAI

from smaran_openai import OpenAIMiddlewareOptions, SmaranConfigurationError, with_smaran


async def test_async_middleware():
    """Test async middleware functionality."""
    print("Testing Async Middleware...")

    try:
        if not os.getenv("OPENAI_API_KEY"):
            print("OPENAI_API_KEY not set - skipping OpenAI test")
            return
        if not os.getenv("SMARAN_API_KEY") or not os.getenv("SMARAN_URL"):
            print("SMARAN_API_KEY/SMARAN_URL not set - skipping Smaran test")
            return

        openai_client = AsyncOpenAI()
        openai_with_memory = with_smaran(
            openai_client,
            OpenAIMiddlewareOptions(
                user_id="test-user-123",
                session_id="test-integration",
                verbose=True,
                add_memory=False,  # Don't save test messages
            ),
        )

        async with openai_with_memory as client:
            print("Context manager works")
            response = await client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": "Hello! This is a test message."}],
                max_tokens=50,
            )
            print(f"API call successful: {response.choices[0].message.content[:50]}...")

    except SmaranConfigurationError as e:
        print(f"Configuration error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")


def test_error_handling():
    """Test error handling without a Smaran API key."""
    print("\nTesting Error Handling...")

    try:
        openai_client = OpenAI(api_key="fake-key")
        with_smaran(
            openai_client,
            OpenAIMiddlewareOptions(user_id="test-user"),
            api_key=None,
            base_url=None,
        )
        print("Should have raised SmaranConfigurationError")
    except SmaranConfigurationError as e:
        print(f"Correctly caught configuration error: {e}")
    except Exception as e:
        print(f"Wrong exception type: {type(e).__name__}: {e}")


async def main():
    """Run all tests."""
    print("Smaran OpenAI Middleware Integration Tests")
    print("=" * 60)

    await test_async_middleware()
    test_error_handling()

    print("\n" + "=" * 60)
    print("Integration tests completed.")
    print("\nTo run with real API calls, set:")
    print("   export OPENAI_API_KEY='your-openai-key'")
    print("   export SMARAN_API_KEY='your-smaran-key'")
    print("   export SMARAN_URL='https://your-smaran-deployment'")


if __name__ == "__main__":
    asyncio.run(main())
