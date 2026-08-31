import { zValidator } from "@hono/zod-validator"
import type { MemoryCore } from "@repo/core"
import { applySelfCorrection, normalizeCodeSwitched } from "@repo/language"
import { Hono } from "hono"

// NOTE: @repo/core also exports applySelfCorrectionSemantic — an
// embedding-prototype cue classifier meant to replace this module's
// English STRONG_CUES phrase list. It is NOT wired in here yet: tested
// against HashEmbedder (the only embedder available in this environment)
// it regresses the self-correction suite from 7/7 to 4/7, because a hash
// embedder carries no real semantics for nearest-centroid comparison to
// work against. Cutting over needs validation against a real semantic
// embedder (OpenAI or better) first — shipping it as the sandbox default
// on unverified behavior would break the product's own flagship demo.
import { z } from "zod"
import { auth } from "../auth.ts"

const saveInput = z.object({
	text: z.string().min(1).max(50_000),
	userId: z.string().max(200).optional(),
	sessionId: z.string().max(200).optional(),
	source: z.enum(["text", "voice"]).default("text"),
	metadata: z.record(z.unknown()).optional(),
})

const deleteParams = z.object({ id: z.string().min(1) })

const QUESTION_TAIL = /\?\s*$/
const ONE_WORD = /^\s*\S+\s*\??\s*$/

/**
 * Turns like "is that 13 or 913?" and "what's your address?" are the
 * agent asking the user for confirmation. They shouldn't create memory.
 * We drop only turns that are BOTH a question AND lack a declarative
 * subject — a caller answering "yes it's 913" still saves.
 */
function isPureQuestion(text: string): boolean {
	if (!QUESTION_TAIL.test(text)) return false
	const declarative = /\b(i (am|have|live|want|prefer|need)|my|our|the)\b/i
	return !declarative.test(text)
}

export function memoriesRouter(core: MemoryCore) {
	return new Hono()
		.post("/", zValidator("json", saveInput), async (c) => {
			const { tenantId } = auth(c)
			const body = c.req.valid("json")

			if (isPureQuestion(body.text) || ONE_WORD.test(body.text.trim())) {
				return c.json({ memories: [], skipped: "question-or-tooshort" })
			}

			const corrected = applySelfCorrection(body.text)
			const norm = normalizeCodeSwitched(corrected.text)

			const memories = await core.save({
				tenantId,
				...body,
				text: norm.text,
				metadata: {
					...(body.metadata ?? {}),
					originalText: body.text,
					correctedText: corrected.text,
					corrections: corrected.corrections,
					fillersRemoved: norm.removed,
					codeSwitched: norm.wasCodeSwitched,
					primaryLanguage: norm.primary,
				},
			})
			return c.json({ memories })
		})
		.delete("/:id", zValidator("param", deleteParams), async (c) => {
			const { tenantId } = auth(c)
			const { id } = c.req.valid("param")
			await core.forget(tenantId, id)
			return c.body(null, 204)
		})
}
