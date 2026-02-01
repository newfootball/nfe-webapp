import { notFound } from "next/navigation";
import { UserProfile } from "@/components/feature/user/user-profile";
import { getSession } from "@/src/lib/auth-server";
import { getUser } from "@/src/query/user.query";

export default async function page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const session = await getSession();

	if (!id) {
		return notFound();
	}

	const user = await getUser(id);

	return <UserProfile user={user} userIdSession={session?.user?.id ?? ""} />;
}
