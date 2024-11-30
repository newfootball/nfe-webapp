import { UserProfile } from "@/components/feature/user/user-profile";

export default async function page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <UserProfile userId={id} />;
}
