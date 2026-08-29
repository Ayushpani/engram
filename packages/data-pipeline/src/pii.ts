/**
 * PII scrubbing. Detects and redacts personal identifiers before a
 * transcript enters the training pipeline. Phase 5 uses regex — Phase 6
 * upgrades to a distilled NER model tuned on Indian PII patterns
 * (Aadhaar, PAN, GSTIN, phone, UPI ID).
 *
 * Redaction is deterministic per document so joins between memories and
 * their entity index stay coherent after scrubbing.
 */

const EMAIL = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g
const PHONE_INTL =
	/\b\+?\d{1,3}[-\s]?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,4}\b/g
const AADHAAR = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g
const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/g
const UPI =
	/\b[a-zA-Z0-9._-]+@(?:okhdfc|okicici|oksbi|okaxis|paytm|ybl|axl|apl|upi|ibl|freecharge)\b/g
const CREDIT_CARD = /\b(?:\d[ -]?){13,16}\b/g
const IP_V4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const URL_WITH_SESSION =
	/https?:\/\/[^\s]*(?:token|session|auth|key|password)[^\s]*/gi

export type PiiKind =
	| "email"
	| "phone"
	| "aadhaar"
	| "pan"
	| "gstin"
	| "upi"
	| "card"
	| "ip"
	| "url_secret"

export interface PiiSpan {
	kind: PiiKind
	value: string
	start: number
	end: number
	replacement: string
}

export interface ScrubResult {
	text: string
	spans: PiiSpan[]
}

const PATTERNS: Array<[PiiKind, RegExp]> = [
	["url_secret", URL_WITH_SESSION],
	["email", EMAIL],
	["upi", UPI],
	["aadhaar", AADHAAR],
	["pan", PAN],
	["gstin", GSTIN],
	["card", CREDIT_CARD],
	["phone", PHONE_INTL],
	["ip", IP_V4],
]

export function scrubPii(input: string): ScrubResult {
	const spans: PiiSpan[] = []
	const claimed: Array<[number, number]> = []
	for (const [kind, pattern] of PATTERNS) {
		for (const match of input.matchAll(pattern)) {
			const start = match.index ?? -1
			if (start < 0) continue
			const end = start + match[0].length
			if (overlaps(claimed, start, end)) continue
			const replacement = `<${kind.toUpperCase()}_${spans.length}>`
			spans.push({ kind, value: match[0], start, end, replacement })
			claimed.push([start, end])
		}
	}
	spans.sort((a, b) => a.start - b.start)
	if (spans.length === 0) return { text: input, spans }

	let cursor = 0
	const parts: string[] = []
	for (const span of spans) {
		parts.push(input.slice(cursor, span.start), span.replacement)
		cursor = span.end
	}
	parts.push(input.slice(cursor))
	return { text: parts.join(""), spans }
}

function overlaps(
	taken: Array<[number, number]>,
	start: number,
	end: number,
): boolean {
	for (const [a, b] of taken) {
		if (!(end <= a || start >= b)) return true
	}
	return false
}
