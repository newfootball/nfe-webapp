import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { toast } from "sonner";
import { LastPostsLiked } from "./_components/last-posts-liked";
import { MyLastPost } from "./_components/my-last-post";
import { MyProfile } from "./_components/my-profile";

export default async function ProfilePage() {
	const session = await auth();

	if (!session?.user?.id || session?.user?.id === null) {
		toast.error("User not found");
		redirect("/sign-in");
	}

	const userId = session?.user?.id;

	return (
		<div className="min-h-screen bg-background flex flex-col">
			<MyProfile userIdSession={userId} />

			<MyLastPost userId={userId} />
			<LastPostsLiked userId={userId} />
		</div>
	);
}
