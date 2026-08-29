#!/usr/bin/env bun

/**
 * Voice-turn benchmark against the sandbox API. Runs a suite of
 * realistic transcripts through save + recall and reports:
 *   - Whether the corrected value (not the retracted one) is what
 *     gets recalled.
 *   - p50/p95 latency for save and recall on the local machine.
 *
 * NOT a network benchmark — the API here is on localhost with
 * HashEmbedder, so the numbers isolate pipeline overhead from
 * network + real embedding cost.
 *
 * Run:
 *   bun run try         # in one terminal
 *   bun run scripts/benchmark-voice-turns.ts  # in another
 */

const BASE = process.env.SMARAN_BASE_URL ?? "http://localhost:8787"
const KEY = process.env.SMARAN_API_KEY ?? "sk_local_dev"

interface Turn {
	name: string
	sessionId: string
	turns: string[]
	recall: {
		query: string
		mustContain: string[]
		mustNotContain: string[]
	}
}

const SUITE: Turn[] = [
	{
		name: "Powai address self-correction (your example)",
		sessionId: "s_powai",
		turns: [
			"i live in powai, no... actual trikutta towers powai, room number 13... sorry 913",
		],
		recall: {
			query: "where does the caller live",
			mustContain: ["Trikutta Towers", "913"],
			mustNotContain: ["Room number 13.", "just powai"],
		},
	},
	{
		name: "Phone number self-correction",
		sessionId: "s_phone",
		turns: ["my phone is 98765, wait no, 987654321"],
		recall: {
			query: "phone number",
			mustContain: ["987654321"],
			mustNotContain: ["phone is 98765,"],
		},
	},
	{
		name: "Name spelling correction",
		sessionId: "s_name",
		turns: ["my name is Ayush, sorry Ayushpani"],
		recall: {
			query: "what is my name",
			mustContain: ["Ayushpani"],
			mustNotContain: [],
		},
	},
	{
		name: "Multi-slot single turn",
		sessionId: "s_multi",
		turns: [
			"my email is old@example.com. actually new@example.com. and my extension is 42",
		],
		recall: {
			query: "email",
			mustContain: ["new@example.com"],
			mustNotContain: ["old@example.com"],
		},
	},
	{
		name: "Hinglish + self-correction",
		sessionId: "s_hinglish",
		turns: [
			"mera address hai andheri, actually bandra west, flat number 21, no 12",
		],
		recall: {
			query: "address",
			mustContain: ["bandra west", "12"],
			mustNotContain: ["andheri"],
		},
	},
	{
		name: "Confirmation question (should NOT save)",
		sessionId: "s_question",
		turns: ["is that 13 or 913?"],
		recall: {
			query: "confirm the number",
			mustContain: [],
			mustNotContain: ["13 or 913"],
		},
	},
	{
		name: "Progressive refinement across turns",
		sessionId: "s_refine",
		turns: ["my company is Acme", "Acme Corporation Private Limited actually"],
		recall: {
			query: "company name",
			mustContain: ["Acme"],
			mustNotContain: [],
		},
	},
]

interface Report {
	name: string
	pass: boolean
	details: string
	saveMs: number[]
	recallMs: number
}

const results: Report[] = []

for (const test of SUITE) {
	const saveMs: number[] = []
	for (const t of test.turns) {
		const t0 = performance.now()
		const res = await fetch(`${BASE}/v1/memories`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ text: t, sessionId: test.sessionId }),
		})
		if (!res.ok)
			throw new Error(`save failed: ${res.status} ${await res.text()}`)
		await res.json()
		saveMs.push(performance.now() - t0)
	}

	const r0 = performance.now()
	const rr = await fetch(`${BASE}/v1/recall`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: test.recall.query,
			sessionId: test.sessionId,
			topK: 5,
			includeCrossSession: false,
		}),
	})
	if (!rr.ok) throw new Error(`recall failed: ${rr.status} ${await rr.text()}`)
	const recall = (await rr.json()) as {
		hits: Array<{ memory: { text: string } }>
	}
	const recallMs = performance.now() - r0

	const allText = recall.hits
		.map((h) => h.memory.text)
		.join("\n")
		.toLowerCase()
	const missing = test.recall.mustContain.filter(
		(s) => !allText.includes(s.toLowerCase()),
	)
	const leaked = test.recall.mustNotContain.filter((s) =>
		allText.includes(s.toLowerCase()),
	)
	const pass = missing.length === 0 && leaked.length === 0
	const details = pass
		? `${recall.hits.length} hit(s)`
		: `missing=[${missing.join(", ")}] leaked=[${leaked.join(", ")}]`
	results.push({ name: test.name, pass, details, saveMs, recallMs })
}

const p = (xs: number[], q: number) => {
	if (xs.length === 0) return 0
	const s = [...xs].sort((a, b) => a - b)
	const idx = Math.floor(q * (s.length - 1))
	return s[idx] ?? 0
}
const allSave = results.flatMap((r) => r.saveMs)
const allRecall = results.map((r) => r.recallMs)

console.log("")
console.log("Voice-turn benchmark — sandbox mode, HashEmbedder")
console.log("─".repeat(72))
for (const r of results) {
	const icon = r.pass ? "✓" : "✗"
	console.log(`${icon} ${r.name}`)
	if (!r.pass) console.log(`  ${r.details}`)
}
console.log("─".repeat(72))
const passed = results.filter((r) => r.pass).length
console.log(`Accuracy: ${passed}/${results.length}`)
console.log(
	`Save   p50=${p(allSave, 0.5).toFixed(1)}ms  p95=${p(allSave, 0.95).toFixed(1)}ms  (n=${allSave.length})`,
)
console.log(
	`Recall p50=${p(allRecall, 0.5).toFixed(1)}ms  p95=${p(allRecall, 0.95).toFixed(1)}ms  (n=${allRecall.length})`,
)
console.log("")
process.exit(passed === results.length ? 0 : 1)
