import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="border-b border-border bg-card">
			<div className="flex items-center gap-3 px-4 py-3">
				<Skeleton className="h-10 w-10 rounded-full" />
				<div className="flex-1 space-y-1.5">
					<Skeleton className="h-3.5 w-28" />
					<Skeleton className="h-3 w-16" />
				</div>
				<Skeleton className="h-5 w-5 rounded-full" />
			</div>
			<Skeleton className="aspect-video w-full" />
			<div className="px-4 pt-3 pb-4 space-y-2.5">
				<div className="flex gap-4">
					<Skeleton className="h-6 w-6 rounded-full" />
					<Skeleton className="h-6 w-6 rounded-full" />
					<Skeleton className="h-6 w-6 rounded-full" />
					<div className="flex-1" />
					<Skeleton className="h-6 w-6 rounded-full" />
				</div>
				<Skeleton className="h-3.5 w-20" />
				<Skeleton className="h-3.5 w-3/4" />
			</div>
		</div>
	);
}
