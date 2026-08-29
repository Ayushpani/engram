import Link from "next/link"
import { SIDEBAR } from "@/lib/docs"

export function Sidebar({ current }: { current: string }) {
	return (
		<nav className="doc-sidebar" aria-label="Docs navigation">
			<Link href="/" className="doc-brand">
				Smaran <i>स्मरण</i>
			</Link>
			{SIDEBAR.map((sec) => (
				<div key={sec.section} className="doc-sec">
					<div className="doc-sec-h">{sec.section}</div>
					<ul>
						{sec.items.map((it) => {
							const active = current === it.slug
							return (
								<li key={it.slug}>
									<Link
										href={`/${it.slug}`}
										className={`doc-link${active ? " on" : ""}${it.stub ? " stub" : ""}`}
									>
										{it.title}
										{it.stub && <span className="doc-stub">soon</span>}
									</Link>
								</li>
							)
						})}
					</ul>
				</div>
			))}
		</nav>
	)
}
