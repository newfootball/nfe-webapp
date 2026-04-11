import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="container mx-auto py-8 px-4">
			<Skeleton className="h-8 w-32 mb-6" />
			<div className="space-y-4 max-w-2xl">
				<Skeleton className="h-10 w-full rounded-md" />
				<Skeleton className="h-24 w-full rounded-md" />
				<Skeleton className="aspect-video w-full rounded-md" />
				<Skeleton className="h-10 w-24 rounded-md" />
			</div>
		</div>
	);
}
