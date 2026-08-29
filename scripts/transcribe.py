#!/usr/bin/env python3
"""Small Python bridge — loads a HuggingFace ASR model and transcribes
an audio file to stdout. Used by scripts/benchmark-audio.ts and
scripts/stream-audio.ts.

Two modes:
  transcribe.py <audio_file>         → prints the full transcript.
  transcribe.py --chunks <audio_file> → prints one line per ~500ms
                                        chunk (streaming simulation).

Default model is Audio8/Audio8-ASR-0.1B (~100M params, CPU-friendly).
Override with --model. Reads WAV/MP3/FLAC/OGG at 16kHz — the loader
resamples for you.

Install (once):
  pip install --upgrade "transformers>=4.40" "torch>=2.1" "torchaudio>=2.1" \\
              "librosa>=0.10" "soundfile>=0.12"
"""

import argparse
import json
import sys
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--model", default="openai/whisper-tiny")
    parser.add_argument("--chunks", action="store_true")
    parser.add_argument("--chunk-ms", type=int, default=500)
    parser.add_argument("--json", action="store_true", help="Emit structured JSON.")
    args = parser.parse_args()

    if not args.audio.exists():
        print(f"error: {args.audio} not found", file=sys.stderr)
        return 1

    try:
        from transformers import pipeline
    except ImportError:
        print(
            "error: transformers not installed. Run:\n"
            "  pip install --upgrade 'transformers>=4.40' 'torch>=2.1' "
            "'torchaudio>=2.1' 'librosa>=0.10' 'soundfile>=0.12'",
            file=sys.stderr,
        )
        return 1

    t_load_start = time.perf_counter()
    asr = pipeline(
        "automatic-speech-recognition",
        model=args.model,
        device="cpu",
        trust_remote_code=True,
    )
    load_ms = int((time.perf_counter() - t_load_start) * 1000)
    print(f"loaded {args.model} in {load_ms}ms", file=sys.stderr)

    if args.chunks:
        t0 = time.perf_counter()
        result = asr(
            str(args.audio),
            return_timestamps="word",
            chunk_length_s=args.chunk_ms / 1000.0,
        )
        elapsed = int((time.perf_counter() - t0) * 1000)
        chunks = result.get("chunks", [])
        if args.json:
            print(json.dumps({"elapsed_ms": elapsed, "chunks": chunks}))
        else:
            for c in chunks:
                print(c.get("text", "").strip())
        return 0

    t0 = time.perf_counter()
    result = asr(str(args.audio))
    elapsed = int((time.perf_counter() - t0) * 1000)
    text = (result.get("text") or "").strip()
    if args.json:
        print(json.dumps({"elapsed_ms": elapsed, "text": text}))
    else:
        print(text)
    print(f"transcribed in {elapsed}ms", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
