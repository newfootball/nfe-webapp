"use client";

import { getHasSeenSplash } from "@/actions/cookies.actions";
import { Layout } from "@/components/layouts/layout";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import Posts from "./posts";

export default function Home() {
	const [hasSeenSplash, setHasSeenSplash] = useState<boolean | null>(null);
	const { data: session } = useSession();

	useEffect(() => {
		const fetchHasSeenSplash = async () => {
			const hasSeenSplash = await getHasSeenSplash();
			setHasSeenSplash(hasSeenSplash);
		};
		fetchHasSeenSplash();
	}, []);

	if (hasSeenSplash === false) {
		return redirect("/splash");
	}

	return (
		<Layout>
			<Posts userId={session?.user?.id} />
		</Layout>
	);
}
