import { PostSkeleton } from "@/components/feature/post/post-skeleton";
import { Shell } from "@/components/shell";

export default function loading() {
	return (
		<Shell>
			<PostSkeleton />
		</Shell>
	);
}
