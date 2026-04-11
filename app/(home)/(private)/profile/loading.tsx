import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="min-h-screen bg-background flex flex-col">
			<Skeleton className="h-40 w-full" />
			<div className="flex flex-col items-center -mt-10 px-4">
				<Skeleton className="h-20 w-20 rounded-full border-4 border-background" />
				<Skeleton className="h-5 w-32 mt-3" />
				<div className="flex gap-8 mt-4">
					<div className="flex flex-col items-center gap-1">
						<Skeleton className="h-4 w-8" />
						<Skeleton className="h-3 w-12" />
					</div>
					<div className="flex flex-col items-center gap-1">
						<Skeleton className="h-4 w-8" />
						<Skeleton className="h-3 w-12" />
					</div>
					<div className="flex flex-col items-center gap-1">
						<Skeleton className="h-4 w-8" />
						<Skeleton className="h-3 w-12" />
					</div>
				</div>
				<Skeleton className="h-9 w-28 mt-4 rounded-md" />
			</div>
			<div className="px-4 mt-6 space-y-4">
				<Skeleton className="h-5 w-36" />
				<div className="space-y-3">
					<Skeleton className="aspect-video w-full rounded-md" />
					<Skeleton className="aspect-video w-full rounded-md" />
				</div>
			</div>
		</div>
	);
}
