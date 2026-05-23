import Engram from "supermemory"

/**
 * Normalizes a base URL by removing trailing slashes.
 *
 * @param url - Optional base URL to normalize
 * @returns Normalized URL without trailing slash, or default API URL
 */
export const normalizeBaseUrl = (url?: string): string => {
	const defaultUrl = "https://api.engram.ai"
	if (!url) return defaultUrl
	return url.endsWith("/") ? url.slice(0, -1) : url
}

/**
 * Options for creating a Engram client.
 */
export interface CreateEngramClientOptions {
	/** Engram API key */
	apiKey: string
	/** Optional custom base URL */
	baseUrl?: string
}

/**
 * Creates a configured Engram client instance.
 *
 * @param options - Client configuration options
 * @returns Configured Engram client
 */
export function createEngramClient(
	options: CreateEngramClientOptions,
): Engram {
	const normalizedBaseUrl = normalizeBaseUrl(options.baseUrl)

	return new Engram({
		apiKey: options.apiKey,
		...(normalizedBaseUrl !== "https://api.engram.ai"
			? { baseURL: normalizedBaseUrl }
			: {}),
	})
}

/**
 * Validates that an API key is provided either via options or environment variable.
 *
 * @param apiKey - Optional API key from options
 * @returns The validated API key
 * @throws Error if no API key is available
 */
export function validateApiKey(apiKey?: string): string {
	const providedApiKey = apiKey ?? process.env.ENGRAM_API_KEY

	if (!providedApiKey) {
		throw new Error(
			"ENGRAM_API_KEY is not set — provide it via `options.apiKey` or set `process.env.ENGRAM_API_KEY`",
		)
	}

	return providedApiKey
}
