#!/usr/bin/env bun

/**
 * Streaming ASR → Smaran ingest, end-to-end.
 *
 * Simulates a live voice call by chunking a WAV file into 500ms
 * windows, transcribing each with the same ASR model as the batch
 * benchmark, and pushing partial transcripts to /v1/ingest/partial as
 * they land. On the last chunk it POSTs /v1/ingest/commit to save the
 * turn — which triggers the self-correction handler + language pass.
 *
 * This is the mode a Vapi / LiveKit / Retell agent would use in
 * production: partials for latency, commit for durability.
 *
 * Setup:
 *   1. bun run try                     # sandbox on :8787
 *   2. bun run scripts/stream-audio.ts path/to/call.wav sess_1 u_test
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

const BASE = process.env.SMARAN_BASE_URL ?? "http://localhost:8787"
const KEY = process.env.SMARAN_API_KEY ?? "sk_local_dev"
const MODEL = process.env.ASR_MODEL ?? "Audio8/Audio8-ASR-0.1B"
const PYTHON = process.env.PYTHON ?? "python3"
const CHUNK_MS = Number(process.env.CHUNK_MS ?? 500)

const [, , argAudioPath, sessionId, userId] = process.argv
if (!argAudioPath || !sessionId) {
	console.error("usage: stream-audio.ts <wav|mp3> <sessionId> [userId]")
	process.exit(1)
}
if (!existsSync(argAudioPath)) {
	console.error(`error: ${argAudioPath} not found`)
	process.exit(1)
}
const audioPath: string = argAudioPath

interface Chunk {
	text: string
	timestamp?: [number, number] | null
}

function transcribeChunks(): Promise<{ chunks: Chunk[]; asrMs: number }> {
	return new Promise((res, rej) => {
		const script = join(import.meta.dir, "transcribe.py")
		const child = spawn(
			PYTHON,
			[
				script,
				audioPath,
				"--model",
				MODEL,
				"--chunks",
				"--chunk-ms",
				String(CHUNK_MS),
				"--json",
			],
			{ stdio: ["ignore", "pipe", "inherit"] },
		)
		let out = ""
		child.stdout.on("data", (d) => (out += d.toString()))
		child.on("exit", (code) => {
			if (code !== 0) return rej(new Error(`transcribe.py exited ${code}`))
			try {
				const parsed = JSON.parse(out.trim())
				res({
					chunks: (parsed.chunks ?? []) as Chunk[],
					asrMs: Number(parsed.elapsed_ms ?? 0),
				})
			} catch (err) {
				rej(new Error(`bad JSON from transcribe.py: ${(err as Error).message}`))
			}
		})
	})
}

async function postPartial(text: string): Promise<void> {
	const res = await fetch(`${BASE}/v1/ingest/partial`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ sessionId, userId, text }),
	})
	if (!res.ok) throw new Error(`partial ${res.status}: ${await res.text()}`)
}

async function postCommit(): Promise<unknown> {
	const res = await fetch(`${BASE}/v1/ingest/commit`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ sessionId, userId, source: "voice" }),
	})
	if (!res.ok) throw new Error(`commit ${res.status}: ${await res.text()}`)
	return res.json()
}

console.error(`streaming ${audioPath} → sess=${sessionId}`)
const start = performance.now()
const { chunks, asrMs } = await transcribeChunks()
console.error(`asr: ${chunks.length} chunk(s) in ${asrMs}ms`)

let running = ""
for (const chunk of chunks) {
	const text = (chunk.text ?? "").trim()
	if (!text) continue
	running = running ? `${running} ${text}` : text
	const t0 = performance.now()
	await postPartial(running)
	console.error(
		`  partial ${(performance.now() - t0).toFixed(1)}ms  "${running}"`,
	)
}

const t0 = performance.now()
const commit = await postCommit()
console.error(`commit ${(performance.now() - t0).toFixed(1)}ms`)
console.error(`total end-to-end: ${(performance.now() - start).toFixed(0)}ms`)
console.log(JSON.stringify(commit, null, 2))
