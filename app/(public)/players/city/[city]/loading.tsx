import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<Skeleton className="h-9 w-72 mb-6" />
			<Skeleton className="h-4 w-80 mb-8" />
			<Skeleton className="h-4 w-40 mb-6" />
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="bg-card rounded-lg shadow-md overflow-hidden">
						<div className="p-6">
							<div className="flex items-start mb-4">
								<Skeleton className="h-15 w-15 rounded-full mr-4" />
								<div className="flex-1">
									<Skeleton className="h-5 w-36 mb-1.5" />
									<Skeleton className="h-3.5 w-20 mb-1" />
									<Skeleton className="h-3 w-28" />
								</div>
							</div>
							<Skeleton className="h-3.5 w-full mb-1" />
							<Skeleton className="h-3.5 w-3/4 mb-4" />
							<div className="flex justify-between">
								<Skeleton className="h-3 w-24" />
								<Skeleton className="h-3 w-16" />
							</div>
						</div>
						<div className="border-t px-6 py-3 bg-muted/30">
							<Skeleton className="h-3 w-28 mb-2" />
							<Skeleton className="h-3 w-full mb-1" />
							<Skeleton className="h-3 w-48" />
						</div>
					</div>
				))}
			</div>
			<div className="mt-12 border-t pt-8">
				<Skeleton className="h-6 w-48 mb-4" />
				<div className="flex flex-wrap gap-2">
					{Array.from({ length: 9 }).map((_, i) => (
						<Skeleton key={i} className="h-9 w-24 rounded-full" />
					))}
				</div>
			</div>
		</div>
	);
}
