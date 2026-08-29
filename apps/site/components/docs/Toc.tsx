import type { TocItem } from "@/lib/docs"

export function Toc({ items }: { items: TocItem[] }) {
	if (items.length === 0) return null
	return (
		<aside className="doc-toc" aria-label="On this page">
			<div className="doc-toc-h">On this page</div>
			<ul>
				{items.map((it) => (
					<li key={it.id} className={`doc-toc-l${it.level}`}>
						<a href={`#${it.id}`}>{it.text}</a>
					</li>
				))}
			</ul>
		</aside>
	)
}
