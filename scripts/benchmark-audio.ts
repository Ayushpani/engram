#!/usr/bin/env bun

/**
 * End-to-end voice benchmark: audio → ASR → Smaran → recall.
 *
 * Reads a directory of audio files + a labels.json describing each
 * clip's expected content and recall queries. For every clip it:
 *   1. Spawns scripts/transcribe.py to get the transcript.
 *   2. POSTs to /v1/memories (self-correction + language pass runs
 *      automatically).
 *   3. POSTs to /v1/recall for each configured query.
 *   4. Checks mustContain / mustNotContain against the recall output.
 *
 * Reports:
 *   - Per-clip accuracy
 *   - ASR latency (p50/p95)
 *   - Save latency
 *   - Recall latency
 *   - End-to-end time from audio bytes to correct memory returned
 *
 * Setup:
 *   1. Start the sandbox in another terminal:
 *        bun run try
 *   2. Point AUDIO_DIR at a folder of .wav/.mp3 files.
 *   3. Drop labels.json alongside them. Schema:
 *        [
 *          {
 *            "file": "call-1.wav",
 *            "sessionId": "s_call1",
 *            "queries": [
 *              {
 *                "query": "where does the caller live",
 *                "mustContain": ["mumbai"],
 *                "mustNotContain": []
 *              }
 *            ]
 *          }
 *        ]
 *   4. bun run scripts/benchmark-audio.ts <AUDIO_DIR>
 */

import { spawn } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import { basename, join, resolve } from "node:path"

const BASE = process.env.SMARAN_BASE_URL ?? "http://localhost:8787"
const KEY = process.env.SMARAN_API_KEY ?? "sk_local_dev"
const MODEL = process.env.ASR_MODEL ?? "openai/whisper-tiny"
const PYTHON = process.env.PYTHON ?? "python3"

interface Query {
	query: string
	mustContain?: string[]
	mustNotContain?: string[]
}

interface ClipLabel {
	file: string
	sessionId: string
	userId?: string
	queries: Query[]
}

interface Report {
	file: string
	transcript: string
	asrMs: number
	saveMs: number
	recallMs: number[]
	pass: boolean
	failures: string[]
}

const audioDir = resolve(process.argv[2] ?? ".")
const labelsPath = join(audioDir, "labels.json")

let labels: ClipLabel[]
try {
	labels = JSON.parse(readFileSync(labelsPath, "utf8"))
} catch (err) {
	console.error(`could not read ${labelsPath}: ${(err as Error).message}`)
	console.error("expected JSON schema shown in the header of this script.")
	process.exit(1)
}

const audioFiles = new Set(
	readdirSync(audioDir).filter((f) => /\.(wav|mp3|flac|ogg)$/i.test(f)),
)

function transcribeOne(
	filePath: string,
): Promise<{ text: string; asrMs: number }> {
	return new Promise((res, rej) => {
		const script = join(import.meta.dir, "transcribe.py")
		const child = spawn(
			PYTHON,
			[script, filePath, "--model", MODEL, "--json"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		)
		let stdout = ""
		let stderr = ""
		child.stdout.on("data", (d) => (stdout += d.toString()))
		child.stderr.on("data", (d) => (stderr += d.toString()))
		child.on("exit", (code) => {
			if (code !== 0)
				return rej(new Error(`transcribe.py exited ${code}\n${stderr}`))
			try {
				const parsed = JSON.parse(stdout.trim())
				res({
					text: String(parsed.text ?? ""),
					asrMs: Number(parsed.elapsed_ms ?? 0),
				})
			} catch (err) {
				rej(
					new Error(
						`could not parse transcribe.py output: ${(err as Error).message}\n${stdout}`,
					),
				)
			}
		})
	})
}

async function postSave(
	text: string,
	sessionId: string,
	userId?: string,
): Promise<number> {
	const t0 = performance.now()
	const res = await fetch(`${BASE}/v1/memories`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ text, sessionId, userId, source: "voice" }),
	})
	if (!res.ok) throw new Error(`save ${res.status}: ${await res.text()}`)
	await res.json()
	return performance.now() - t0
}

async function postRecall(
	query: string,
	sessionId: string,
): Promise<{ text: string; ms: number }> {
	const t0 = performance.now()
	const res = await fetch(`${BASE}/v1/recall`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query,
			sessionId,
			topK: 5,
			includeCrossSession: false,
		}),
	})
	if (!res.ok) throw new Error(`recall ${res.status}: ${await res.text()}`)
	const json = (await res.json()) as {
		hits: Array<{ memory: { text: string } }>
	}
	const ms = performance.now() - t0
	const text = json.hits
		.map((h) => h.memory.text)
		.join("\n")
		.toLowerCase()
	return { text, ms }
}

const reports: Report[] = []

for (const label of labels) {
	if (!audioFiles.has(label.file)) {
		console.warn(`skip: ${label.file} not in ${audioDir}`)
		continue
	}
	const filePath = join(audioDir, label.file)
	process.stderr.write(`\n${basename(label.file)}: transcribing…`)
	const { text, asrMs } = await transcribeOne(filePath)
	process.stderr.write(
		` ${asrMs}ms → "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"\n`,
	)

	const saveMs = await postSave(text, label.sessionId, label.userId)

	const recallMs: number[] = []
	const failures: string[] = []
	for (const q of label.queries) {
		const { text: recallText, ms } = await postRecall(q.query, label.sessionId)
		recallMs.push(ms)
		for (const s of q.mustContain ?? []) {
			if (!recallText.includes(s.toLowerCase())) failures.push(`missing "${s}"`)
		}
		for (const s of q.mustNotContain ?? []) {
			if (recallText.includes(s.toLowerCase())) failures.push(`leaked "${s}"`)
		}
	}

	reports.push({
		file: label.file,
		transcript: text,
		asrMs,
		saveMs,
		recallMs,
		pass: failures.length === 0,
		failures,
	})
}

const p = (xs: number[], q: number): number => {
	if (xs.length === 0) return 0
	const s = [...xs].sort((a, b) => a - b)
	return s[Math.floor(q * (s.length - 1))] ?? 0
}
const allAsr = reports.map((r) => r.asrMs)
const allSave = reports.map((r) => r.saveMs)
const allRecall = reports.flatMap((r) => r.recallMs)

console.log("")
console.log(`Audio benchmark — ASR=${MODEL} → Smaran (sandbox)`)
console.log("─".repeat(72))
for (const r of reports) {
	console.log(
		`${r.pass ? "✓" : "✗"} ${r.file}   asr=${r.asrMs}ms  save=${r.saveMs.toFixed(1)}ms  recall p50=${p(r.recallMs, 0.5).toFixed(1)}ms`,
	)
	if (!r.pass) for (const f of r.failures) console.log(`  ${f}`)
}
console.log("─".repeat(72))
const passed = reports.filter((r) => r.pass).length
console.log(`Accuracy: ${passed}/${reports.length}`)
console.log(
	`ASR    p50=${p(allAsr, 0.5)}ms  p95=${p(allAsr, 0.95)}ms  (n=${allAsr.length})`,
)
console.log(
	`Save   p50=${p(allSave, 0.5).toFixed(1)}ms  p95=${p(allSave, 0.95).toFixed(1)}ms  (n=${allSave.length})`,
)
console.log(
	`Recall p50=${p(allRecall, 0.5).toFixed(1)}ms  p95=${p(allRecall, 0.95).toFixed(1)}ms  (n=${allRecall.length})`,
)
console.log("")
process.exit(passed === reports.length ? 0 : 1)
