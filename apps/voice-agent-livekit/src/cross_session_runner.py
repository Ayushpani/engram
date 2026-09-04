"""
Cross-session persistence test: runs session_a.json in one LiveKit room
(the user telling facts), disconnects, then runs session_b.json in a
SEPARATE fresh room (the user asking to recall those facts) — the way a
real user would end one call and start a new one later.

This is the test that actually isolates a memory layer's value: a plain
LLM's chat context is scoped to a single room/session, so on a fresh room
it structurally cannot know anything from session_a. If Smaran is wired
in, session_b's recall pulls from Supabase instead of chat history, so it
should still know.

Usage:
    uv run src\\cross_session_runner.py <base-name> <out.json>

For repeated trials (recommended before quoting a pass rate — see
CROSS_SESSION_RESULTS.md), use run_repeated_cross_session.sh instead:
    bash src/run_repeated_cross_session.sh <label> <N>

Rooms used: "<base-name>--a" and "<base-name>--b". agent.py derives its
Smaran user id as everything before "--", so both rooms map to the same
Smaran user (letting memory persist across them) while each room is still
a fully separate LiveKit session/LLM context (so a plain LLM has zero
carryover, exactly like a real second phone call).
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents.voice.room_io._output import TOPIC_TRANSCRIPTION
from livekit.agents.voice.room_io.room_io import TOPIC_CHAT

load_dotenv(".env.local")

AGENT_NAME = "my-agent"
QUIET_WINDOW_S = 1.5
REPLY_TIMEOUT_S = 60

SESSION_A = json.loads(Path("src/session_a.json").read_text())
SESSION_B = json.loads(Path("src/session_b.json").read_text())


async def run_room(room_name: str, script: list[dict]) -> list[dict]:
    lkapi = api.LiveKitAPI(
        os.getenv("LIVEKIT_URL"),
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET"),
    )
    try:
        await lkapi.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(agent_name=AGENT_NAME, room=room_name)
        )
        print(f"dispatched agent '{AGENT_NAME}' to room '{room_name}'")
    finally:
        await lkapi.aclose()

    room = rtc.Room()
    token = (
        api.AccessToken(os.getenv("LIVEKIT_API_KEY"), os.getenv("LIVEKIT_API_SECRET"))
        .with_identity("eval-caller")
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .to_jwt()
    )
    await room.connect(os.getenv("LIVEKIT_URL"), token)
    await asyncio.sleep(3)

    chunk_queue: asyncio.Queue[str] = asyncio.Queue()
    background_tasks: set[asyncio.Task] = set()

    def on_transcription(reader: rtc.TextStreamReader, participant_identity: str):
        async def consume():
            text = await reader.read_all()
            if text:
                await chunk_queue.put(text)

        task = asyncio.ensure_future(consume())
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)

    room.register_text_stream_handler(TOPIC_TRANSCRIPTION, on_transcription)

    async def collect_reply() -> str:
        chunks = []
        first = await asyncio.wait_for(chunk_queue.get(), timeout=REPLY_TIMEOUT_S)
        chunks.append(first)
        while True:
            try:
                nxt = await asyncio.wait_for(chunk_queue.get(), timeout=QUIET_WINDOW_S)
                chunks.append(nxt)
            except asyncio.TimeoutError:
                break
        return " ".join(chunks).strip()

    results = []
    for item in script:
        t0 = time.monotonic()
        await room.local_participant.send_text(item["turn"], topic=TOPIC_CHAT)
        try:
            reply = await collect_reply()
        except asyncio.TimeoutError:
            reply = "[TIMEOUT: no reply within 60s]"
        elapsed_ms = (time.monotonic() - t0) * 1000

        entry = {"turn": item["turn"], "reply": reply, "latency_ms": elapsed_ms}
        if "expect_any" in item:
            reply_lower = reply.lower()
            entry["expect_any"] = item["expect_any"]
            entry["passed"] = any(
                exp.lower() in reply_lower for exp in item["expect_any"]
            )
        results.append(entry)

        tag = ""
        if "passed" in entry:
            tag = " [PASS]" if entry["passed"] else " [FAIL]"
        print(f"[{elapsed_ms:6.0f}ms]{tag} {item['turn'][:40]!r} -> {reply[:70]!r}")

    await room.disconnect()
    return results


async def main(base_name: str, out_path: str):
    room_a = f"{base_name}--a"
    room_b = f"{base_name}--b"

    print(f"=== Session A (telling facts) — room '{room_a}' ===")
    results_a = await run_room(room_a, SESSION_A)

    print("\nSession A done. Waiting 5s before starting a completely fresh room...\n")
    await asyncio.sleep(5)

    print(f"=== Session B (recalling facts, FRESH room) — room '{room_b}' ===")
    results_b = await run_room(room_b, SESSION_B)

    passed = sum(1 for r in results_b if r.get("passed"))
    total = sum(1 for r in results_b if "passed" in r)
    print(f"\nSession B recall score: {passed}/{total} passed")

    Path(out_path).write_text(
        json.dumps(
            {
                "session_a": results_a,
                "session_b": results_b,
                "score": f"{passed}/{total}",
            },
            indent=2,
        )
    )
    print(f"Wrote results to {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: uv run src\\cross_session_runner.py <base-name> <out.json>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
