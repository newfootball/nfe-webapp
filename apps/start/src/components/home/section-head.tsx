import type { ReactNode } from "react";

export function SectionHead({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children?: ReactNode;
}) {
	return (
		<div className="flex items-baseline justify-between px-4 pt-6 pb-2.5 sm:px-0">
			<h2
				id={id}
				className="font-display text-[13px] font-medium tracking-[0.14em] uppercase"
			>
				{title}
			</h2>
			{children}
		</div>
	);
}
export const sectionLink =
	"text-[11.5px] text-muted-foreground hover:text-foreground";
