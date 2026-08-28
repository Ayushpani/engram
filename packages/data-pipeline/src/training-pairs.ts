import { normalizeCodeSwitched } from "@repo/language"
import { scrubPii } from "./pii.ts"

/**
 * Turns memory rows into training pairs for the Phase-5 distilled
 * embedder + reranker. Every training sample is:
 *   - PII-scrubbed
 *   - Filler-stripped (via @repo/language)
 *   - Tagged with the source language and code-switch flag
 * so we can train per-language and per-mixed subsets independently.
 *
 * The output shape is intentionally close to what sentence-transformers
 * and BGE fine-tuning scripts consume — { query, positive, negative? }.
 */

export interface MemoryRow {
	id: string
	text: string
	userId: string | null
	sessionId: string | null
	kind: string
	createdAt: string
}

export interface TrainingSample {
	query: string
	positive: string
	negative?: string
	labels: {
		language: string
		codeSwitched: boolean
		kind: string
		sameSession: boolean
	}
}

export interface PairingOptions {
	includeNegatives?: boolean
	minPositiveLength?: number
}

/**
 * Build positive pairs from co-session memories. Two memories in the
 * same session are treated as related; a memory from a different
 * session in the same tenant is treated as a hard negative.
 * Deliberately simple — a Phase-6 sampler will use graph proximity.
 */
export function buildTrainingPairs(
	memories: MemoryRow[],
	opts: PairingOptions = {},
): TrainingSample[] {
	const minLen = opts.minPositiveLength ?? 8
	const bySession = new Map<string, MemoryRow[]>()
	for (const m of memories) {
		const key = m.sessionId ?? "_"
		const list = bySession.get(key) ?? []
		list.push(m)
		bySession.set(key, list)
	}

	const samples: TrainingSample[] = []
	const sessions = Array.from(bySession.entries())

	for (const [sessionId, rows] of sessions) {
		for (let i = 0; i < rows.length; i++) {
			for (let j = i + 1; j < rows.length; j++) {
				const a = rows[i]!
				const b = rows[j]!
				if (a.text.length < minLen || b.text.length < minLen) continue
				const query = normalizeAndScrub(a.text)
				const positive = normalizeAndScrub(b.text)
				const sample: TrainingSample = {
					query: query.text,
					positive: positive.text,
					labels: {
						language: positive.language,
						codeSwitched: positive.codeSwitched,
						kind: b.kind,
						sameSession: sessionId !== "_",
					},
				}
				if (opts.includeNegatives) {
					const negative = pickNegative(sessions, sessionId)
					if (negative) sample.negative = normalizeAndScrub(negative.text).text
				}
				samples.push(sample)
			}
		}
	}
	return samples
}

function pickNegative(
	sessions: Array<[string, MemoryRow[]]>,
	excludeSession: string,
): MemoryRow | undefined {
	for (const [id, rows] of sessions) {
		if (id === excludeSession) continue
		if (rows.length > 0) return rows[Math.floor(Math.random() * rows.length)]
	}
	return undefined
}

interface NormalizedText {
	text: string
	language: string
	codeSwitched: boolean
}

function normalizeAndScrub(text: string): NormalizedText {
	const scrubbed = scrubPii(text)
	const norm = normalizeCodeSwitched(scrubbed.text)
	return {
		text: norm.text,
		language: norm.primary,
		codeSwitched: norm.wasCodeSwitched,
	}
}
