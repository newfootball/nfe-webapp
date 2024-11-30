import { cn } from "@/lib/utils";

export function Shell({
	children,
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("grid items-center gap-8 pb-8 pt-6 md:py-8", className)}
			{...props}
		>
			{children}
		</div>
	);
}
