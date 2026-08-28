import { extractEntities, type Entity } from "./entities.ts"

/**
 * Session-scoped pronoun resolver. Tracks recently mentioned entities
 * and expands pronouns in later turns. English + Hindi/Hinglish coverage.
 * Deliberately conservative — never rewrites the original text, only
 * appends resolutions the retriever can use as an extra signal.
 */

interface Slot {
	entity: Entity
	lastSeenAt: number
}

const HE = new Set([
	"he",
	"him",
	"his",
	"vo",
	"voh",
	"woh",
	"uska",
	"uski",
	"uske",
	"unka",
	"unki",
	"unke",
])
const SHE = new Set([
	"she",
	"her",
	"hers",
	"vo",
	"voh",
	"woh",
	"uska",
	"uski",
	"uske",
])
const IT = new Set(["it", "its", "that", "this", "yeh", "ye", "vo", "woh"])
const THEY = new Set(["they", "them", "their", "theirs", "unhone", "unka"])

export interface ResolvedText {
	original: string
	resolved: string
	substitutions: Array<{ pronoun: string; entity: string }>
}

export class SessionCoreference {
	private turn = 0
	private readonly recent: Slot[] = []
	private readonly maxAge = 6

	ingest(text: string): Entity[] {
		this.turn += 1
		const entities = extractEntities(text)
		for (const e of entities) {
			this.recent.push({ entity: e, lastSeenAt: this.turn })
		}
		this.evict()
		return entities
	}

	resolve(text: string): ResolvedText {
		this.ingest(text)
		const subs: ResolvedText["substitutions"] = []
		const tokens = text.split(/(\s+)/)
		let anyReplacement = false
		const out = tokens.map((tok) => {
			const key = tok.replace(/[.,!?;:]+$/g, "").toLowerCase()
			const target = this.pickTarget(key)
			if (target) {
				subs.push({ pronoun: tok.trim(), entity: target.name })
				anyReplacement = true
				return `${tok} (${target.name})`
			}
			return tok
		})
		return {
			original: text,
			resolved: anyReplacement ? out.join("") : text,
			substitutions: subs,
		}
	}

	stats() {
		return { turn: this.turn, tracked: this.recent.length }
	}

	private pickTarget(pronoun: string): Entity | undefined {
		if (HE.has(pronoun) || SHE.has(pronoun) || THEY.has(pronoun)) {
			return this.mostRecent((e) => e.kind === "person" || e.kind === "unknown")
		}
		if (IT.has(pronoun)) {
			return this.mostRecent((e) => e.kind !== "person")
		}
		return undefined
	}

	private mostRecent(pred: (e: Entity) => boolean): Entity | undefined {
		for (let i = this.recent.length - 1; i >= 0; i--) {
			if (pred(this.recent[i]!.entity)) return this.recent[i]!.entity
		}
		return undefined
	}

	private evict() {
		const cutoff = this.turn - this.maxAge
		while (this.recent.length > 0 && this.recent[0]!.lastSeenAt < cutoff) {
			this.recent.shift()
		}
	}
}
