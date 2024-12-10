import { UserProfile } from "@/components/feature/user/user-profile";
import { Suspense } from "react";

export default async function page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	return (
		<Suspense fallback={<div>Loading...</div>}>
			{/* @ts-expect-error Async Server Component */}
			<UserProfile userId={id} />
		</Suspense>
	);
}
