import type { Embedder } from "./embedder.ts"

/**
 * Nearest-centroid semantic classification, replacing the three English
 * regexes `HeuristicConsolidator.classify()` used to run
 * (`/\b(i (like|love...` etc.). Instead of a closed keyword list, this
 * embeds a small multilingual exemplar set per class ONCE, and classifies
 * every candidate by cosine similarity to those centroids — continuous,
 * and it generalizes to paraphrase and unseen languages by construction,
 * which a fixed word list structurally cannot.
 *
 * Honest limitation: this is only as good as the embedder's semantics.
 * Under `HashEmbedder` (sandbox/dev — a character hash, not a real
 * embedding) nearest-centroid comparison is no better than chance. That's
 * an acceptable trade here because `kind` is a metadata label, not a
 * ranking/gating input anywhere in the recall path today — a wrong
 * `kind` under the dev sandbox costs nothing at query time. Under a real
 * embedder (OpenAI or better) the classification is genuinely semantic.
 */

export type Kind = "fact" | "preference" | "event" | "entity"

const EXEMPLARS: Record<Kind, string[]> = {
	preference: [
		"I like dark mode.",
		"I prefer tea over coffee.",
		"My favourite colour is blue.",
		"mujhe cricket bahut pasand hai",
		"no me gusta el ruido",
		"I hate long meetings.",
	],
	event: [
		"I moved to Mumbai last year.",
		"We met yesterday at the office.",
		"The flight lands tomorrow morning.",
		"kal main Delhi gaya tha",
		"la reunión fue el lunes pasado",
		"I graduated in 2019.",
	],
	entity: [
		"Trikutta Towers, Powai.",
		"Ayushpani Panigrahi",
		"Acme Corporation Private Limited",
		"Priya Sharma",
		"स्मरण टेक्नोलॉजीज़",
		"Mumbai, Maharashtra",
	],
	fact: [
		"I live in a two bedroom apartment.",
		"My phone number is nine eight seven six five.",
		"The stove gets hot when it's on.",
		"mera address andheri west mein hai",
		"tengo dos hermanos",
		"Water boils at 100 degrees Celsius.",
	],
}

const KINDS: Kind[] = ["fact", "preference", "event", "entity"]

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
	const dim = vecs[0]?.length
	const out = new Float32Array(dim)
	for (const v of vecs) for (let i = 0; i < dim; i++) out[i]! += v[i]!
	for (let i = 0; i < dim; i++) out[i]! /= vecs.length
	return out
}

export interface Classifier {
	/** Classify an already-computed embedding — reuses the vector save() already produced, no extra embedder call. */
	classify(vec: Float32Array): Promise<Kind>
}

export function createClassifier(embedder: Embedder): Classifier {
	let centroids: Promise<Record<Kind, Float32Array>> | null = null

	async function getCentroids(): Promise<Record<Kind, Float32Array>> {
		if (!centroids) {
			centroids = (async () => {
				const flat = KINDS.flatMap((k) => EXEMPLARS[k])
				const vecs = await embedder.embedBatch(flat)
				const out = {} as Record<Kind, Float32Array>
				let offset = 0
				for (const k of KINDS) {
					const n = EXEMPLARS[k].length
					out[k] = centroid(vecs.slice(offset, offset + n))
					offset += n
				}
				return out
			})()
		}
		return centroids
	}

	return {
		async classify(vec: Float32Array): Promise<Kind> {
			const c = await getCentroids()
			let best: Kind = "fact"
			let bestScore = Number.NEGATIVE_INFINITY
			for (const k of KINDS) {
				const score = cosine(vec, c[k])
				if (score > bestScore) {
					bestScore = score
					best = k
				}
			}
			return best
		},
	}
}
