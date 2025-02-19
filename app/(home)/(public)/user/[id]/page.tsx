import { UserProfile } from "@/components/feature/user/user-profile";
import { auth } from "@/src/lib/auth";
import { getUser } from "@/src/query/user.query";
import { notFound } from "next/navigation";

export default async function page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const session = await auth();

	if (!id) {
		return notFound();
	}

	const user = await getUser(id);

	return (
		<>
			<UserProfile user={user} userIdSession={session?.user?.id ?? ""} />
		</>
	);
}
