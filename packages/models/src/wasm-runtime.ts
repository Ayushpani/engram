/**
 * Placeholder WASM runtime for the future distilled voice-tuned embedder
 * and reranker. Deliberately abstract — the real .wasm binaries land in
 * Phase 6 once training completes, and this file describes the shape
 * everything downstream (edge worker, API, browser SDK) will bind to.
 *
 * Nothing here loads real weights yet. What this DOES do:
 *  - Codify the loader signature so a swap is a one-line change.
 *  - Ship a NoopWasmModel so tests + edge worker paths compile today.
 *  - Provide the WasmModelRegistry entry point so per-tenant fine-tunes
 *    can be looked up by name at recall time.
 */

export interface WasmModelHandle {
	readonly name: string
	readonly kind: "embedder" | "reranker"
	readonly dim?: number
	readonly bytes: number
	free(): void
}

export interface WasmEmbedder extends WasmModelHandle {
	kind: "embedder"
	embed(text: string): Promise<Float32Array>
}

export interface WasmReranker extends WasmModelHandle {
	kind: "reranker"
	score(query: string, document: string): Promise<number>
}

export interface WasmModelLoader {
	load(name: string): Promise<WasmModelHandle>
}

export class WasmModelRegistry {
	private readonly cache = new Map<string, WasmModelHandle>()
	constructor(private readonly loader: WasmModelLoader) {}

	async get(name: string): Promise<WasmModelHandle> {
		const cached = this.cache.get(name)
		if (cached) return cached
		const handle = await this.loader.load(name)
		this.cache.set(name, handle)
		return handle
	}

	async warm(names: string[]): Promise<void> {
		await Promise.all(names.map((n) => this.get(n)))
	}

	unload(name: string): void {
		const cached = this.cache.get(name)
		if (!cached) return
		cached.free()
		this.cache.delete(name)
	}

	names(): string[] {
		return Array.from(this.cache.keys())
	}
}

/** Deterministic no-op — for CI, tests, and early-adopter fallbacks. */
export class NoopWasmEmbedder implements WasmEmbedder {
	readonly kind = "embedder" as const
	readonly bytes = 0
	constructor(
		readonly name: string,
		readonly dim: number = 384,
	) {}
	async embed(text: string): Promise<Float32Array> {
		const v = new Float32Array(this.dim)
		let h = 2166136261 >>> 0
		for (let i = 0; i < text.length; i++) {
			h ^= text.charCodeAt(i)
			h = Math.imul(h, 16777619) >>> 0
		}
		for (let i = 0; i < this.dim; i++) v[i] = ((h >>> i % 32) & 1) - 0.5
		return v
	}
	free(): void {}
}

export class NoopWasmLoader implements WasmModelLoader {
	async load(name: string): Promise<WasmModelHandle> {
		return new NoopWasmEmbedder(name)
	}
}
