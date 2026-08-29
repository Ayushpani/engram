import { notFound } from "next/navigation"
import { compileMDX } from "next-mdx-remote/rsc"
import { Sidebar } from "@/components/docs/Sidebar"
import { Toc } from "@/components/docs/Toc"
import { allDocSlugs, extractToc, readDoc } from "@/lib/docs"
import { useMDXComponents } from "@/mdx-components"

interface Params {
	slug: string[]
}

export async function generateStaticParams(): Promise<Params[]> {
	return allDocSlugs().map((s) => ({
		slug: s.split("/"),
	}))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<Params>
}) {
	const { slug } = await params
	const doc = readDoc(`docs/${slug.join("/")}`)
	if (!doc) return {}
	return {
		title: `${doc.title} · Smaran Docs`,
		description: doc.description,
	}
}

export default async function DocPage({ params }: { params: Promise<Params> }) {
	const { slug } = await params
	const fullSlug = `docs/${slug.join("/")}`
	const doc = readDoc(fullSlug)
	if (!doc) notFound()
	const toc = extractToc(doc.body)
	// biome-ignore lint/suspicious/noExplicitAny: compileMDX's component-map
	// type is internal — cast at the boundary.
	const components = useMDXComponents({}) as any
	const { content } = await compileMDX({
		source: doc.body,
		components,
		options: { parseFrontmatter: false },
	})
	return (
		<div className="doc-shell">
			<Sidebar current={fullSlug} />
			<main className="doc-main">
				<div className="doc-eyebrow">{doc.section}</div>
				<h1 className="doc-h1">{doc.title}</h1>
				{doc.description && <p className="doc-lede">{doc.description}</p>}
				<div className="doc-prose">{content}</div>
			</main>
			<Toc items={toc} />
		</div>
	)
}
