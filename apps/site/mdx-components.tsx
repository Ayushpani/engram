import type { ComponentPropsWithoutRef } from "react"
import { Callout } from "@/components/docs/Callout"

// Local type shim — matches the shape of the "mdx/types" MDXComponents map.
type MDXComponents = Record<string, unknown>

// Slugify a heading's plain text — matches the TOC extractor in lib/docs.ts.
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
}

function extractText(children: unknown): string {
	if (typeof children === "string") return children
	if (Array.isArray(children)) return children.map(extractText).join("")
	if (
		children &&
		typeof children === "object" &&
		"props" in children &&
		children.props &&
		typeof children.props === "object" &&
		"children" in children.props
	) {
		return extractText(
			(children as { props: { children: unknown } }).props.children,
		)
	}
	return ""
}

export function useMDXComponents(
	components: MDXComponents = {},
): MDXComponents {
	return {
		h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => {
			const id = slugify(extractText(children))
			return (
				<h2 id={id} {...props}>
					<a
						href={`#${id}`}
						className="doc-h-anchor"
						aria-label={`Link to ${extractText(children)}`}
					>
						#
					</a>
					{children}
				</h2>
			)
		},
		h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => {
			const id = slugify(extractText(children))
			return (
				<h3 id={id} {...props}>
					{children}
				</h3>
			)
		},
		Callout,
		...components,
	}
}
