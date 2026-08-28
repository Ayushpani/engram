import { detectScript } from "./detect.ts"

/**
 * Heuristic entity extractor. Covers the patterns that regex catches
 * reliably: capitalized names, currency amounts, dates, times, phone
 * numbers, and Devanagari proper nouns. Phase 5 replaces with a
 * distilled NER model trained on voice-agent transcripts.
 */

export type EntityKind =
	| "person"
	| "place"
	| "org"
	| "time"
	| "date"
	| "number"
	| "money"
	| "unknown"

export interface Entity {
	name: string
	kind: EntityKind
	span: [number, number]
}

const MONEY =
	/(?:₹|Rs\.?|USD?|EUR|\$)\s*[0-9,]+(?:\.[0-9]+)?(?:\s*(?:lakh|crore|k|K|M|thousand|million))?/g
const NUMERIC = /\b[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?\b/g
const PHONE =
	/\b(?:\+?\d{1,3}[-\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,4}\b/g
const TIME = /\b(?:1[0-2]|0?[1-9])(?::[0-5][0-9])?\s?(?:am|pm|AM|PM)\b/g
const DATE =
	/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s?\d{4})?\b/g
const CAPITALIZED =
	/\b(?:[A-Z][a-z]{2,}|[A-Z]\.[A-Z]\.[A-Z]?)(?:\s+(?:[A-Z][a-z]{2,}))*/g
const DEVANAGARI_NAME = /[ऀ-ॿ]{3,}(?:\s+[ऀ-ॿ]{3,})*/g

const STOPWORDS = new Set([
	"The",
	"He",
	"She",
	"It",
	"They",
	"I",
	"We",
	"You",
	"Yes",
	"No",
	"Ok",
	"Okay",
	"Hi",
	"Hello",
	"Hey",
	"Please",
	"Sorry",
	"Thanks",
])

const PLACE_HINTS = new Set([
	"Delhi",
	"Mumbai",
	"Bangalore",
	"Bengaluru",
	"Chennai",
	"Kolkata",
	"Hyderabad",
	"Pune",
	"Ahmedabad",
	"Jaipur",
	"India",
	"USA",
	"UK",
	"London",
	"Tokyo",
	"Singapore",
	"NYC",
])

const ORG_HINTS =
	/\b(Pvt\.?\s?Ltd\.?|Ltd\.?|Inc\.?|Corp\.?|LLC|GmbH|LLP|Company|Bank|Airlines|Hospital|University)\b/

export function extractEntities(text: string): Entity[] {
	const out: Entity[] = []

	for (const match of text.matchAll(MONEY)) {
		out.push({
			name: match[0],
			kind: "money",
			span: [match.index!, match.index! + match[0].length],
		})
	}
	for (const match of text.matchAll(TIME)) {
		out.push({
			name: match[0],
			kind: "time",
			span: [match.index!, match.index! + match[0].length],
		})
	}
	for (const match of text.matchAll(DATE)) {
		out.push({
			name: match[0],
			kind: "date",
			span: [match.index!, match.index! + match[0].length],
		})
	}
	for (const match of text.matchAll(PHONE)) {
		const digits = match[0].replace(/\D/g, "")
		if (digits.length >= 7) {
			out.push({
				name: match[0],
				kind: "number",
				span: [match.index!, match.index! + match[0].length],
			})
		}
	}
	for (const match of text.matchAll(CAPITALIZED)) {
		const name = match[0].trim()
		if (STOPWORDS.has(name) || name.length < 3) continue
		if (spanCovered(out, match.index!, name.length)) continue
		const kind: EntityKind = PLACE_HINTS.has(name)
			? "place"
			: ORG_HINTS.test(text.slice(match.index!, match.index! + 40))
				? "org"
				: "person"
		out.push({ name, kind, span: [match.index!, match.index! + name.length] })
	}
	for (const match of text.matchAll(DEVANAGARI_NAME)) {
		if (spanCovered(out, match.index!, match[0].length)) continue
		out.push({
			name: match[0],
			kind: "unknown",
			span: [match.index!, match.index! + match[0].length],
		})
	}
	for (const match of text.matchAll(NUMERIC)) {
		if (spanCovered(out, match.index!, match[0].length)) continue
		const cp = text.codePointAt(match.index!)
		if (cp !== undefined && detectScript(cp) !== "digit") continue
		out.push({
			name: match[0],
			kind: "number",
			span: [match.index!, match.index! + match[0].length],
		})
	}

	out.sort((a, b) => a.span[0] - b.span[0])
	return dedupeByName(out)
}

function spanCovered(
	existing: Entity[],
	start: number,
	length: number,
): boolean {
	const end = start + length
	for (const e of existing) {
		const [a, b] = e.span
		if (!(end <= a || start >= b)) return true
	}
	return false
}

function dedupeByName(entities: Entity[]): Entity[] {
	const seen = new Map<string, Entity>()
	for (const e of entities) {
		const key = `${e.kind}:${e.name.toLowerCase()}`
		if (!seen.has(key)) seen.set(key, e)
	}
	return Array.from(seen.values())
}
