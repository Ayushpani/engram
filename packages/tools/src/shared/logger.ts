import type { Logger } from "./types"

/**
 * Creates a logger instance that outputs to console when verbose mode is enabled.
 *
 * @param verbose - When true, logs are written to console; when false, logs are silently ignored
 * @returns Logger instance with debug, info, warn, and error methods
 */
export const createLogger = (verbose: boolean): Logger => {
	if (!verbose) {
		return {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		}
	}

	return {
		debug: (message: string, data?: unknown) => {
			console.log(
				`[smaran] ${message}`,
				data ? JSON.stringify(data, null, 2) : "",
			)
		},
		info: (message: string, data?: unknown) => {
			console.log(
				`[smaran] ${message}`,
				data ? JSON.stringify(data, null, 2) : "",
			)
		},
		warn: (message: string, data?: unknown) => {
			console.warn(
				`[smaran] ${message}`,
				data ? JSON.stringify(data, null, 2) : "",
			)
		},
		error: (message: string, data?: unknown) => {
			console.error(
				`[smaran] ${message}`,
				data ? JSON.stringify(data, null, 2) : "",
			)
		},
	}
}
