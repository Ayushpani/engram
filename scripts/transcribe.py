#!/usr/bin/env python3
"""Small Python bridge - loads Whisper and transcribes an audio file
to stdout. Used by scripts/benchmark-audio.ts and scripts/stream-audio.ts.

Uses WhisperProcessor + WhisperForConditionalGeneration directly instead
of the transformers ASR pipeline, because transformers 5.16's pipeline
unconditionally imports torchcodec in its preprocess step, which fails
on stock Windows without the FFmpeg DLL bundle. This direct path only
needs librosa for audio decode and Whisper for inference - no torchcodec,
no ffmpeg on PATH.

Modes:
  transcribe.py <audio_file>          -> prints the full transcript.
  transcribe.py --chunks <audio_file> -> splits the transcript into fake
                                          N-word chunks for streaming
                                          simulation.

Default model is openai/whisper-tiny (~150MB, CPU-friendly, English).
Override with --model.

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
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
    except ImportError as e:
        print(
            f"error: missing dep ({e}). Run:\n"
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
    processor = WhisperProcessor.from_pretrained(args.model)
    model = WhisperForConditionalGeneration.from_pretrained(args.model)
    model.eval()
    load_ms = int((time.perf_counter() - t_load_start) * 1000)
    print(f"loaded {args.model} in {load_ms}ms", file=sys.stderr)

    # Decode audio to 16kHz mono ndarray with librosa. This is the only
    # audio-decode step; no ffmpeg, no torchcodec.
    audio_array, _ = librosa.load(str(args.audio), sr=16000, mono=True)

    t0 = time.perf_counter()
    inputs = processor(
        audio_array,
        sampling_rate=16000,
        return_tensors="pt",
    )
    with torch.no_grad():
        predicted_ids = model.generate(inputs.input_features, max_new_tokens=440)
    text = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()
    elapsed = int((time.perf_counter() - t0) * 1000)

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
