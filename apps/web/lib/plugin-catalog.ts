export interface InstallStep {
	title: string
	description?: string
	code?: string
	copyLabel?: string
	optional?: boolean
	/** Blur the code block until hovered/focused (e.g. it contains the key). */
	secret?: boolean
}

export interface PluginInfo {
	id: string
	name: string
	tagline: string
	icon: string
	docsUrl?: string
	/** Steps shown after a key is minted. The literal `sm_...` is replaced
	 *  with the freshly generated key when rendered. */
	installSteps?: InstallStep[]
}

/** Match `FREE_TIER_PLUGIN_IDS` in mono `packages/lib/plugins.ts`. */
export const FREE_TIER_PLUGIN_IDS = ["hermes", "codex"]

export function isFreeTierPlugin(pluginId: string): boolean {
	return FREE_TIER_PLUGIN_IDS.includes(pluginId)
}

export const PLUGIN_CATALOG: Record<string, PluginInfo> = {
	claude_code: {
		id: "claude_code",
		name: "Claude Code",
		tagline: "Remembers your conventions, decisions, and project context",
		icon: "/images/plugins/claude-code.svg",
		docsUrl: "https://docs.smaran.ai/integrations/claude-code",
		installSteps: [
			{
				title: "Save your API key",
				description:
					"Add this to your shell profile so Claude Code can authenticate. This key is shown only once — save it now.",
				code: 'export SMARAN_CC_API_KEY="sm_..."',
				copyLabel: "API key",
				secret: true,
			},
			{
				title: "Install the plugin",
				description: "Run these commands inside a Claude Code session:",
				code: "/plugin marketplace add smaranai/claude-smaran\n/plugin install claude-smaran",
			},
		],
	},
	codex: {
		id: "codex",
		name: "Codex",
		tagline: "Persistent memory for the Codex CLI — free on every plan",
		icon: "/images/plugins/codex.png",
		docsUrl: "https://docs.smaran.ai/integrations/codex",
		installSteps: [
			{
				title: "Save your API key",
				description:
					"Add this to your shell profile. This key is shown only once — save it now.",
				code: 'export SMARAN_CODEX_API_KEY="sm_..."',
				copyLabel: "API key",
				secret: true,
			},
			{
				title: "Install the hooks",
				description: "Run this to wire Smaran into Codex CLI:",
				code: "npx codex-smaran@latest install",
			},
		],
	},
	opencode: {
		id: "opencode",
		name: "OpenCode",
		tagline: "Long-term memory for your OpenCode sessions",
		icon: "/images/plugins/opencode.svg",
		docsUrl: "https://docs.smaran.ai/integrations/opencode",
		installSteps: [
			{
				title: "Save your API key",
				description:
					"Add this to your shell profile. This key is shown only once — save it now.",
				code: 'export SMARAN_API_KEY="sm_..."',
				copyLabel: "API key",
				secret: true,
			},
			{
				title: "Install the plugin",
				description: "Use --no-tui for non-interactive environments.",
				code: "bunx opencode-smaran@latest install",
			},
			{
				title: "Verify your config",
				description:
					"Ensure ~/.config/opencode/opencode.jsonc includes the plugin:",
				code: '{\n  "plugin": ["opencode-smaran"]\n}',
				optional: true,
			},
		],
	},
	openclaw: {
		id: "openclaw",
		name: "OpenClaw",
		tagline: "Cross-platform memory across Telegram, Discord, Slack",
		icon: "/images/plugins/openclaw.svg",
		docsUrl: "https://docs.smaran.ai/integrations/openclaw",
		installSteps: [
			{
				title: "Install the plugin",
				description: "Run this in your OpenClaw project:",
				code: "openclaw plugins install @smaran/openclaw-smaran",
			},
			{
				title: "Configure Smaran",
				description:
					"Run the setup command and paste your API key when prompted:",
				code: "openclaw smaran setup",
			},
		],
	},
	hermes: {
		id: "hermes",
		name: "Hermes",
		tagline: "Persistent memory for the Hermes agent — free on every plan",
		icon: "/images/plugins/hermes.svg",
		docsUrl: "https://docs.smaran.ai/integrations/hermes",
		installSteps: [
			{
				title: "Run Hermes memory setup",
				description:
					"On the machine where Hermes is deployed, start the memory wizard, choose Smaran as the provider, and paste your API key when prompted:",
				code: "hermes memory setup",
			},
		],
	},
}

const SPACE_TO_CATALOG_ID: Record<string, string> = {
	"claude-code": "claude_code",
	codex: "codex",
	opencode: "opencode",
	openclaw: "openclaw",
}

export function spacePluginIdToCatalogId(spacePluginId: string): string | null {
	return SPACE_TO_CATALOG_ID[spacePluginId] ?? null
}
