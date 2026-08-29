import type { ReactNode } from "react"

export function Callout({
	tone = "info",
	title,
	children,
}: {
	tone?: "info" | "warn" | "note"
	title?: string
	children: ReactNode
}) {
	return (
		<div className={`callout callout-${tone}`}>
			{title && <div className="callout-t">{title}</div>}
			<div className="callout-b">{children}</div>
		</div>
	)
}
