// Types
export type {
	MemoryPromptData,
	PromptTemplate,
	MemoryMode,
	AddMemoryMode,
	Logger,
	ProfileStructure,
	ProfileMarkdownData,
	SmaranBaseOptions,
} from "./types"

// Logger
export { createLogger } from "./logger"

// Prompt builder
export {
	defaultPromptTemplate,
	convertProfileToMarkdown,
	formatMemoriesForPrompt,
} from "./prompt-builder"

// Cache
export { MemoryCache, makeTurnKey } from "./cache"

// Context
export {
	normalizeBaseUrl,
	createSmaranClient,
	validateApiKey,
	type CreateSmaranClientOptions,
} from "./context"

// Memory client
export {
	smaranProfileSearch,
	buildMemoriesText,
	extractQueryText,
	getLastUserMessageText,
	type BuildMemoriesTextOptions,
	type GenericMessage,
} from "./memory-client"
