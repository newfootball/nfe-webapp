import { Skeleton } from "@/components/ui/skeleton";

const playerSkeletons = [
	"player-1",
	"player-2",
	"player-3",
	"player-4",
	"player-5",
	"player-6",
];

export default function Loading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<Skeleton className="h-9 w-56 mb-6" />
			<Skeleton className="h-4 w-96 mb-8" />
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{playerSkeletons.map((key) => (
					<div
						key={key}
						className="bg-card rounded-lg shadow-md overflow-hidden"
					>
						<div className="p-6">
							<div className="flex items-center mb-4">
								<Skeleton className="h-15 w-15 rounded-full mr-4" />
								<div>
									<Skeleton className="h-5 w-36 mb-1.5" />
									<Skeleton className="h-3.5 w-28" />
								</div>
							</div>
							<Skeleton className="h-3.5 w-full mb-1" />
							<Skeleton className="h-3.5 w-3/4 mb-4" />
							<Skeleton className="h-3 w-24" />
						</div>
						<div className="border-t px-6 py-4">
							<Skeleton className="h-3.5 w-28 mb-2" />
							<Skeleton className="h-3 w-full mb-1" />
							<Skeleton className="h-3 w-48" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
