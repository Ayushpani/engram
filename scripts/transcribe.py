#!/usr/bin/env python3
"""Small Python bridge — loads a HuggingFace ASR model and transcribes
an audio file to stdout. Used by scripts/benchmark-audio.ts and
scripts/stream-audio.ts.

Two modes:
  transcribe.py <audio_file>          → prints the full transcript.
  transcribe.py --chunks <audio_file> → prints one line per fake
                                        chunk (streaming simulation);
                                        splits the full transcript by
                                        word count so we never touch
                                        torchcodec/ffmpeg on Windows.

Default model is openai/whisper-tiny (~150MB, CPU-friendly, no custom
code, works on every OS). Override with --model. Reads WAV/MP3/FLAC/OGG
at 16kHz via librosa — no ffmpeg on PATH required.

Install (once):
  pip install --upgrade "transformers>=4.40" "torch>=2.1" \\
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
    parser.add_argument(
        "--words-per-chunk",
        type=int,
        default=3,
        help="Fake-streaming chunk size in words (--chunks mode).",
    )
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
            "'librosa>=0.10' 'soundfile>=0.12'",
            file=sys.stderr,
        )
        return 1

    try:
        import librosa
    except ImportError:
        print("error: librosa not installed. pip install 'librosa>=0.10'", file=sys.stderr)
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

    # Decode audio in-process with librosa (16kHz mono ndarray). This
    # skips the HF pipeline's ffmpeg loader entirely.
    audio_array, _ = librosa.load(str(args.audio), sr=16000, mono=True)

    # One plain full transcription — no return_timestamps, no
    # chunk_length_s. Those paths pull in torchcodec, which needs FFmpeg
    # DLLs on Windows and dies with cryptic ctypes errors on stock
    # installs. For streaming simulation we split the resulting text
    # into fake chunks in --chunks mode.
    t0 = time.perf_counter()
    result = asr(audio_array)
    elapsed = int((time.perf_counter() - t0) * 1000)
    text = (result.get("text") or "").strip()

    if args.chunks:
        words = text.split()
        n = max(1, args.words_per_chunk)
        chunks = [
            {"text": " ".join(words[i : i + n])}
            for i in range(0, len(words), n)
        ]
        if args.json:
            print(json.dumps({"elapsed_ms": elapsed, "chunks": chunks, "text": text}))
        else:
            for c in chunks:
                print(c["text"])
        print(f"transcribed in {elapsed}ms ({len(chunks)} fake chunks)", file=sys.stderr)
        return 0

    if args.json:
        print(json.dumps({"elapsed_ms": elapsed, "text": text}))
    else:
        print(text)
    print(f"transcribed in {elapsed}ms", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
