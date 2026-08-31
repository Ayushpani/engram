import { tokenize } from "@repo/language"
import type { Embedder } from "./embedder.ts"

/**
 * Voice self-correction, semantic version. Same job as
 * @repo/language's applySelfCorrection (still kept, pure-sync, no
 * embedder — used where an embedder isn't available), but replaces its
 * fixed English `STRONG_CUES` phrase list with embedding-prototype
 * classification: "is this short clause a retraction cue" becomes a
 * nearest-centroid comparison against multilingual cue/non-cue exemplars,
 * not a literal string match. Generalizes to paraphrase and languages
 * with zero representation in a hardcoded list.
 *
 * Segmentation itself now splits on punctuation/pause marks only
 * (comma, period, dash, ellipsis, semicolon, newline) — language-neutral
 * delimiters, not cue words. Whether a resulting short clause IS a cue is
 * then a classification question, not a splitting question.
 */

const CUE_EXEMPLARS = [
	"no",
	"wait",
	"actually",
	"sorry",
	"scratch that",
	"my mistake",
	"my bad",
	"I mean",
	"let me correct that",
	"correction",
	"nahi",
	"ruko",
	"vastav mein",
	"maaf karna",
	"मेरा मतलब है",
	"गलती से",
	"espera",
	"en realidad",
	"lo siento",
	"corrección",
	"perdón",
]

const NON_CUE_EXEMPLARS = [
	"yes",
	"okay",
	"thanks",
	"hello",
	"please",
	"nine one three",
	"Trikutta Towers",
	"my phone number",
	"good morning",
	"haan",
	"theek hai",
	"dhanyavaad",
	"gracias",
	"buenos días",
	"por favor",
]

const BARE_NUMBER = /^\s*\d+\s*$/
const BARE_EMAIL =
	/^\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\s*[.!]?\s*$/
const BARE_PHONE = /^\s*\+?\d[\d\s\-()]{5,}\s*$/

// Short clauses only — a cue is a brief interjection, not a full sentence
// that happens to share vocabulary with one of the exemplars.
const CUE_MAX_TOKENS = 4
// Minimum margin the cue centroid must win by, so an ambiguous short
// clause defaults to "content", not "cue" (a false cue silently drops
// real user content, which is worse than an occasional missed cue).
const CUE_MARGIN = 0.03

export interface Correction {
	kind: "replace" | "patch" | "cue"
	retracted: string
	kept: string
}

export interface SelfCorrectionResult {
	text: string
	corrections: Correction[]
	segments: string[]
}

export interface RetractionClassifier {
	/** True if this short clause reads as a retraction/correction cue rather than content. */
	isCue(vec: Float32Array): boolean
}

export function createRetractionClassifier(
	cueCentroid: Float32Array,
	nonCueCentroid: Float32Array,
): RetractionClassifier {
	return {
		isCue(vec) {
			const cueSim = cosine(vec, cueCentroid)
			const nonCueSim = cosine(vec, nonCueCentroid)
			return cueSim - nonCueSim > CUE_MARGIN
		},
	}
}

let cachedCentroids: Promise<{ cue: Float32Array; nonCue: Float32Array }> | null =
	null

async function getCentroids(
	embedder: Embedder,
): Promise<{ cue: Float32Array; nonCue: Float32Array }> {
	if (!cachedCentroids) {
		cachedCentroids = (async () => {
			const [cueVecs, nonCueVecs] = await Promise.all([
				embedder.embedBatch(CUE_EXEMPLARS),
				embedder.embedBatch(NON_CUE_EXEMPLARS),
			])
			return { cue: centroid(cueVecs), nonCue: centroid(nonCueVecs) }
		})()
	}
	return cachedCentroids
}

export async function applySelfCorrectionSemantic(
	input: string,
	embedder: Embedder,
): Promise<SelfCorrectionResult> {
	const trimmed = input.trim()
	if (!trimmed) return { text: "", corrections: [], segments: [] }

	const rawClauses = splitOnPunctuation(trimmed)
	if (rawClauses.length <= 1) {
		return { text: trimmed, corrections: [], segments: rawClauses }
	}

	const { cue: cueCentroid, nonCue: nonCueCentroid } = await getCentroids(embedder)
	const classifier = createRetractionClassifier(cueCentroid, nonCueCentroid)

	// Punctuation splits clauses apart but an inline cue ("actually bandra
	// west") isn't bounded by punctuation from the content that follows it
	// — so for each clause, also test its leading 1-2 tokens as a
	// candidate cue prefix and strip it if it classifies as one.
	const candidates: Array<{ text: string; kind: "clause" | "prefix1" | "prefix2" }> =
		[]
	for (const clause of rawClauses) {
		const tokens = tokenize(clause)
		if (tokens.length <= CUE_MAX_TOKENS) candidates.push({ text: clause, kind: "clause" })
		if (tokens.length > 1) candidates.push({ text: tokens[0]!, kind: "prefix1" })
		if (tokens.length > 2) {
			candidates.push({ text: `${tokens[0]} ${tokens[1]}`, kind: "prefix2" })
		}
	}
	const uniqueTexts = Array.from(new Set(candidates.map((c) => c.text)))
	const vecs = uniqueTexts.length ? await embedder.embedBatch(uniqueTexts) : []
	const cueOf = new Map<string, boolean>()
	uniqueTexts.forEach((t, i) => cueOf.set(t, classifier.isCue(vecs[i]!)))

	const segments: string[] = []
	const corrections: Correction[] = []
	const kept: string[] = []
	let pendingReplace = false

	for (const rawClause of rawClauses) {
		const tokens = tokenize(rawClause)
		let clause = rawClause
		let sawInlineCue = false

		// Whole short clause reads as a pure cue — drop it entirely.
		if (tokens.length <= CUE_MAX_TOKENS && cueOf.get(rawClause)) {
			segments.push(rawClause)
			corrections.push({ kind: "cue", retracted: "", kept: rawClause })
			pendingReplace = true
			continue
		}

		// Longer clause with a cue-like leading prefix — strip it, keep
		// the rest as the real content (2-token prefix checked first so
		// "no wait" strips together rather than leaving "wait").
		if (tokens.length > 2 && cueOf.get(`${tokens[0]} ${tokens[1]}`)) {
			clause = stripLeadingWords(rawClause, 2)
			sawInlineCue = true
		} else if (tokens.length > 1 && cueOf.get(tokens[0]!)) {
			clause = stripLeadingWords(rawClause, 1)
			sawInlineCue = true
		}

		segments.push(clause)
		if (sawInlineCue) pendingReplace = true

		const patched = tryPatch(kept[kept.length - 1], clause)
		if (patched) {
			corrections.push({
				kind: "patch",
				retracted: kept[kept.length - 1]!,
				kept: patched,
			})
			kept[kept.length - 1] = patched
			pendingReplace = false
			continue
		}

		if (pendingReplace && kept.length > 0) {
			corrections.push({
				kind: "replace",
				retracted: kept[kept.length - 1]!,
				kept: clause,
			})
			kept[kept.length - 1] = clause
			pendingReplace = false
			continue
		}

		kept.push(clause)
	}

	return { text: kept.join(", "), corrections, segments }
}

/** Strips the leading `n` whitespace-delimited words, for peeling a stripped cue prefix off a clause. */
function stripLeadingWords(text: string, n: number): string {
	const trimmed = text.trim()
	const parts = trimmed.split(/\s+/)
	return parts.slice(n).join(" ").trim() || trimmed
}

function splitOnPunctuation(text: string): string[] {
	return text
		.split(/[,;.\-—…\n]+/u)
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
}

function tryPatch(prior: string | undefined, current: string): string | null {
	if (!prior) return null
	if (BARE_NUMBER.test(current)) {
		return replaceLastToken(prior, /\b\d+\b/g, current.trim())
	}
	if (BARE_EMAIL.test(current)) {
		return replaceLastToken(
			prior,
			/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
			current.trim().replace(/[.!]$/, ""),
		)
	}
	if (BARE_PHONE.test(current) && /\d/.test(prior)) {
		return replaceLastToken(prior, /\+?\d[\d\s\-()]{5,}/g, current.trim())
	}
	return null
}

function replaceLastToken(
	haystack: string,
	pattern: RegExp,
	replacement: string,
): string | null {
	const matches = Array.from(haystack.matchAll(pattern))
	if (matches.length === 0) return null
	const last = matches[matches.length - 1]!
	const start = last.index ?? 0
	return (
		haystack.slice(0, start) + replacement + haystack.slice(start + last[0].length)
	)
}

function cosine(a: Float32Array, b: Float32Array): number {
	const len = Math.min(a.length, b.length)
	let dot = 0
	let na = 0
	let nb = 0
	for (let i = 0; i < len; i++) {
		const av = a[i]!
		const bv = b[i]!
		dot += av * bv
		na += av * av
		nb += bv * bv
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb)
	return denom === 0 ? 0 : dot / denom
}

function centroid(vecs: Float32Array[]): Float32Array {
	const dim = vecs[0]!.length
	const out = new Float32Array(dim)
	for (const v of vecs) for (let i = 0; i < dim; i++) out[i]! += v[i]!
	for (let i = 0; i < dim; i++) out[i]! /= vecs.length
	return out
}
