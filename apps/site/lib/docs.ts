import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

export interface Doc {
	slug: string
	title: string
	description?: string
	section: string
	order: number
	body: string
}

export interface SidebarItem {
	slug: string
	title: string
	stub?: boolean
}

export interface SidebarSection {
	section: string
	items: SidebarItem[]
}

export const SIDEBAR: SidebarSection[] = [
	{
		section: "Get started",
		items: [
			{ slug: "docs", title: "Overview" },
			{ slug: "docs/quickstart", title: "Quickstart" },
			{ slug: "docs/voice", title: "Voice concepts" },
		],
	},
	{
		section: "SDK",
		items: [
			{ slug: "docs/sdk", title: "TypeScript SDK" },
			{ slug: "docs/api", title: "REST API", stub: true },
		],
	},
	{
		section: "Integrations",
		items: [
			{ slug: "docs/mcp", title: "MCP server", stub: true },
			{ slug: "docs/skill", title: "Claude Skill", stub: true },
			{ slug: "docs/adapters/vapi", title: "Vapi", stub: true },
			{ slug: "docs/adapters/livekit", title: "LiveKit", stub: true },
			{ slug: "docs/adapters/pipecat", title: "Pipecat", stub: true },
			{ slug: "docs/adapters/retell", title: "Retell", stub: true },
			{ slug: "docs/adapters/anthropic", title: "Anthropic", stub: true },
			{ slug: "docs/adapters/openai", title: "OpenAI / Codex", stub: true },
			{ slug: "docs/adapters/gemini", title: "Gemini", stub: true },
		],
	},
	{
		section: "Operations",
		items: [
			{ slug: "docs/self-host", title: "Self-host", stub: true },
			{ slug: "docs/dpdp", title: "DPDP & data handling", stub: true },
		],
	},
]

const CONTENT_ROOT = path.join(process.cwd(), "content", "docs")

function slugToFile(slug: string): string {
	const rel = slug.replace(/^docs\/?/, "")
	if (!rel) return path.join(CONTENT_ROOT, "index.mdx")
	return path.join(CONTENT_ROOT, `${rel}.mdx`)
}

export function readDoc(slug: string): Doc | null {
	const file = slugToFile(slug)
	if (!fs.existsSync(file)) return null
	const raw = fs.readFileSync(file, "utf8")
	const { data, content } = matter(raw)
	return {
		slug,
		title: data.title ?? slug,
		description: data.description,
		section: data.section ?? "Docs",
		order: data.order ?? 999,
		body: content,
	}
}

export function allDocSlugs(): string[] {
	const out: string[] = []
	function walk(dir: string, prefix: string) {
		if (!fs.existsSync(dir)) return
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				walk(path.join(dir, entry.name), `${prefix}${entry.name}/`)
			} else if (entry.name.endsWith(".mdx") && entry.name !== "index.mdx") {
				out.push(`${prefix}${entry.name.replace(/\.mdx$/, "")}`)
			}
		}
	}
	walk(CONTENT_ROOT, "")
	return out
}

// Extract H2/H3 headings from raw MDX for the TOC.
export interface TocItem {
	id: string
	text: string
	level: 2 | 3
}
export function extractToc(body: string): TocItem[] {
	const out: TocItem[] = []
	const re = /^(##|###)\s+(.+?)\s*$/gm
	let m: RegExpExecArray | null
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
	while ((m = re.exec(body)) !== null) {
		const level = m[1] === "##" ? 2 : 3
		const text = m[2].replace(/[*_`]/g, "").trim()
		const id = text
			.toLowerCase()
			.replace(/[^\w\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-")
		out.push({ id, text, level })
	}
	return out
}
