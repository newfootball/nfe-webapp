import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<div className="flex justify-start">
					<div className="flex items-start gap-2 max-w-[70%]">
						<Skeleton className="w-8 h-8 rounded-full" />
						<Skeleton className="h-16 w-48 rounded-lg" />
					</div>
				</div>
				<div className="flex justify-end">
					<div className="flex items-start gap-2 max-w-[70%] flex-row-reverse">
						<Skeleton className="w-8 h-8 rounded-full" />
						<Skeleton className="h-12 w-40 rounded-lg" />
					</div>
				</div>
				<div className="flex justify-start">
					<div className="flex items-start gap-2 max-w-[70%]">
						<Skeleton className="w-8 h-8 rounded-full" />
						<Skeleton className="h-20 w-56 rounded-lg" />
					</div>
				</div>
				<div className="flex justify-end">
					<div className="flex items-start gap-2 max-w-[70%] flex-row-reverse">
						<Skeleton className="w-8 h-8 rounded-full" />
						<Skeleton className="h-12 w-36 rounded-lg" />
					</div>
				</div>
			</div>
			<div className="border-t p-4">
				<Skeleton className="h-10 w-full rounded-md" />
			</div>
		</div>
	);
}
