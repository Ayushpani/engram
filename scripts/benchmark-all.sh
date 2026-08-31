#!/usr/bin/env bash
# Run the voice-turn + audio suites against a live API and capture stdout.
#
# Usage:
#   scripts/benchmark-all.sh <run-label>
#
# The run-label goes into the output filename and header — e.g.:
#   scripts/benchmark-all.sh A-memory-hash
#   scripts/benchmark-all.sh D-supabase-openai
#
# Assumes the API is already running on $SMARAN_BASE_URL (default
# http://localhost:8787) with the config you want to test. It does NOT
# spawn the API — you drive that separately so the same script covers
# every run.

set -euo pipefail

LABEL="${1:-unlabeled}"
BASE="${SMARAN_BASE_URL:-http://localhost:8787}"
OUT_DIR="scripts/benchmark-runs"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/${LABEL}-$(date -u +%Y%m%dT%H%M%SZ).txt"

echo "==== Smaran benchmark run: $LABEL ====" | tee "$OUT"
echo "Base URL:  $BASE"                       | tee -a "$OUT"
echo "Timestamp: $(date -u -Iseconds)"        | tee -a "$OUT"
echo "Commit:    $(git rev-parse HEAD 2>/dev/null || echo unknown)" | tee -a "$OUT"
echo                                           | tee -a "$OUT"

echo "--- Health check ---"                   | tee -a "$OUT"
curl -sS "$BASE/health" | tee -a "$OUT"
echo                                           | tee -a "$OUT"
echo                                           | tee -a "$OUT"

echo "--- Voice-turn suite ---"               | tee -a "$OUT"
SMARAN_BASE_URL="$BASE" bun run scripts/benchmark-voice-turns.ts 2>&1 | tee -a "$OUT"
echo                                           | tee -a "$OUT"

if [ -d "scripts/audio-samples" ] && [ -n "$(ls scripts/audio-samples/*.wav 2>/dev/null || true)" ]; then
	echo "--- Audio suite ---"                | tee -a "$OUT"
	SMARAN_BASE_URL="$BASE" bun run scripts/benchmark-audio.ts scripts/audio-samples 2>&1 | tee -a "$OUT"
else
	echo "--- Audio suite skipped (no scripts/audio-samples/*.wav) ---" | tee -a "$OUT"
fi

echo                                           | tee -a "$OUT"
echo "Report saved: $OUT"
