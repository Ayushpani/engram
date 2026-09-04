#!/usr/bin/env bash
# Runs cross_session_runner.py N times back-to-back with distinct room
# names, and aggregates the per-run recall pass rate.
#
# Usage: run_repeated_cross_session.sh <run-label> <N>
# Example: run_repeated_cross_session.sh smaran-run 5
#
# Assumes the agent worker (uv run python src/agent.py dev) is already
# running with the SMARAN_ENABLED value you want to measure.

set -euo pipefail

LABEL="${1:?usage: run_repeated_cross_session.sh <run-label> <N>}"
N="${2:?usage: run_repeated_cross_session.sh <run-label> <N>}"

TOTAL_PASSED=0
TOTAL_QUESTIONS=0
RESULTS_DIR="repeated_results_${LABEL}"
mkdir -p "$RESULTS_DIR"

for i in $(seq 1 "$N"); do
  ROOM_NAME="${LABEL}-$(date +%s)-${i}"
  OUT_FILE="${RESULTS_DIR}/run_${i}.json"
  echo "=== Run ${i}/${N}: room base '${ROOM_NAME}' ==="
  uv run python src/cross_session_runner.py "$ROOM_NAME" "$OUT_FILE"

  SCORE_LINE=$(python -c "
import json
d = json.load(open('${OUT_FILE}'))
passed = sum(1 for r in d['session_b'] if r.get('passed'))
total = sum(1 for r in d['session_b'] if 'passed' in r)
print(f'{passed} {total}')
")
  PASSED=$(echo "$SCORE_LINE" | cut -d' ' -f1)
  QTOTAL=$(echo "$SCORE_LINE" | cut -d' ' -f2)
  TOTAL_PASSED=$((TOTAL_PASSED + PASSED))
  TOTAL_QUESTIONS=$((TOTAL_QUESTIONS + QTOTAL))
  echo "--- Run ${i} score: ${PASSED}/${QTOTAL} (running total: ${TOTAL_PASSED}/${TOTAL_QUESTIONS}) ---"
  sleep 3
done

echo ""
echo "===================================================="
echo "AGGREGATE for '${LABEL}': ${TOTAL_PASSED}/${TOTAL_QUESTIONS} questions passed across ${N} runs"
python -c "print(f'Pass rate: {${TOTAL_PASSED} / ${TOTAL_QUESTIONS} * 100:.1f}%')"
echo "===================================================="
