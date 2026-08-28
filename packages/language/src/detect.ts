/**
 * Script + language detection via Unicode ranges. Deliberately narrow —
 * covers the eight Indian scripts we support in Phase 4 plus Latin.
 * Phase 5 replaces with a distilled classifier trained on real calls.
 */

export type Script =
	| "latin"
	| "devanagari"
	| "bengali"
	| "gurmukhi"
	| "tamil"
	| "telugu"
	| "kannada"
	| "malayalam"
	| "gujarati"
	| "digit"
	| "other"

export type Language =
	| "en"
	| "hi"
	| "mr"
	| "bn"
	| "pa"
	| "ta"
	| "te"
	| "kn"
	| "ml"
	| "gu"
	| "mixed"
	| "unknown"

const SCRIPT_RANGES: Array<{ from: number; to: number; script: Script }> = [
	{ from: 0x0030, to: 0x0039, script: "digit" },
	{ from: 0x0041, to: 0x005a, script: "latin" },
	{ from: 0x0061, to: 0x007a, script: "latin" },
	{ from: 0x0900, to: 0x097f, script: "devanagari" },
	{ from: 0x0980, to: 0x09ff, script: "bengali" },
	{ from: 0x0a00, to: 0x0a7f, script: "gurmukhi" },
	{ from: 0x0a80, to: 0x0aff, script: "gujarati" },
	{ from: 0x0b80, to: 0x0bff, script: "tamil" },
	{ from: 0x0c00, to: 0x0c7f, script: "telugu" },
	{ from: 0x0c80, to: 0x0cff, script: "kannada" },
	{ from: 0x0d00, to: 0x0d7f, script: "malayalam" },
]

export function detectScript(codepoint: number): Script {
	for (const range of SCRIPT_RANGES) {
		if (codepoint >= range.from && codepoint <= range.to) return range.script
	}
	return "other"
}

const SCRIPT_TO_LANG: Record<Script, Language> = {
	latin: "en",
	devanagari: "hi",
	bengali: "bn",
	gurmukhi: "pa",
	gujarati: "gu",
	tamil: "ta",
	telugu: "te",
	kannada: "kn",
	malayalam: "ml",
	digit: "unknown",
	other: "unknown",
}

export interface DetectionResult {
	primary: Language
	codeSwitched: boolean
	scripts: Record<Script, number>
}

export function detectLanguage(text: string): DetectionResult {
	const scripts: Record<Script, number> = {
		latin: 0,
		devanagari: 0,
		bengali: 0,
		gurmukhi: 0,
		gujarati: 0,
		tamil: 0,
		telugu: 0,
		kannada: 0,
		malayalam: 0,
		digit: 0,
		other: 0,
	}
	let letters = 0
	for (const ch of text) {
		const cp = ch.codePointAt(0)!
		const s = detectScript(cp)
		scripts[s] += 1
		if (s !== "other" && s !== "digit") letters += 1
	}
	if (letters === 0) {
		return { primary: "unknown", codeSwitched: false, scripts }
	}
	const ranked = (Object.entries(scripts) as Array<[Script, number]>)
		.filter(([s, n]) => n > 0 && s !== "digit" && s !== "other")
		.sort(([, a], [, b]) => b - a)
	if (ranked.length === 0) {
		return { primary: "unknown", codeSwitched: false, scripts }
	}
	const primaryScript = ranked[0]![0]
	const primary = SCRIPT_TO_LANG[primaryScript]
	const codeSwitched = ranked.length > 1 && ranked[1]![1] / letters > 0.08
	return { primary: codeSwitched ? "mixed" : primary, codeSwitched, scripts }
}
