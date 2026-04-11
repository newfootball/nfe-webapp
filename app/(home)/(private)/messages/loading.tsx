import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="min-h-screen bg-background flex flex-col">
			<div className="p-4">
				<Skeleton className="h-6 w-24" />
			</div>
			<div className="px-4 pb-4">
				<div className="flex gap-3 overflow-hidden">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton key={i} className="h-14 w-14 rounded-full shrink-0" />
					))}
				</div>
			</div>
			<div className="px-4 pb-4">
				<Skeleton className="h-11 w-full rounded-md" />
			</div>
			<div className="px-4 space-y-3">
				{Array.from({ length: 5 }).map((_, i) => (
					<div key={i} className="flex items-center gap-3 py-2">
						<Skeleton className="h-12 w-12 rounded-full" />
						<div className="flex-1 space-y-1.5">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-3 w-48" />
						</div>
						<Skeleton className="h-3 w-10" />
					</div>
				))}
			</div>
		</div>
	);
}
