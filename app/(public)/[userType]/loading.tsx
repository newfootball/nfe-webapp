import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<Skeleton className="h-9 w-48 mb-6" />
			<Skeleton className="h-4 w-80 mb-8" />
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="bg-card rounded-lg shadow-md p-6">
						<div className="flex flex-col items-center text-center">
							<Skeleton className="h-20 w-20 rounded-full mb-4" />
							<Skeleton className="h-5 w-32 mb-1" />
							<Skeleton className="h-3.5 w-20 mb-3" />
							<Skeleton className="h-3 w-24 mb-2" />
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-3/4 mt-1" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
