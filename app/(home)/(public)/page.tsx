import { Layout } from "@/components/layouts/layout";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Posts from "./posts";

export default async function Home() {
	const cookieStore = await cookies();
	const hasSeenSplash = cookieStore.get("seen_splash")?.value === "true";

	if (!hasSeenSplash) {
		return redirect("/splash");
	}

	const session = await auth();

	return (
		<Layout>
			<Posts userId={session?.user?.id} />
		</Layout>
	);
}
