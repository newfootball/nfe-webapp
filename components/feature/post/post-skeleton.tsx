import { Skeleton } from "@/components/ui/skeleton";

export function PostSkeleton() {
	return (
		<div className="space-y-4 px-4">
			<div className="space-y-2">
				<Skeleton className="h-5 w-3/4" />
				<div className="space-y-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-4/6" />
				</div>
			</div>
			<Skeleton className="aspect-video w-full rounded-lg" />
		</div>
	);
}
