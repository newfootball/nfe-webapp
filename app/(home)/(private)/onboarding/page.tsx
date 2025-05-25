"use client";

import { Shell } from "@/components/shell";
import { auth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OnboardingSteps } from "./onboarding-steps";

export default function OnboardingPage() {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const checkProfile = async () => {
			const session = await auth();
			if (!session?.user) {
				router.push("/auth/sign-in");
				return;
			}

			const response = await fetch(`/api/users/${session.user.id}/profile`);
			const profile = await response.json();

			if (profile?.userType) {
				router.push("/feed");
				return;
			}

			setIsLoading(false);
		};

		checkProfile();
	}, [router]);

	if (isLoading) {
		return null;
	}

	return (
		<Shell className="max-w-xl">
			<div className="flex flex-col space-y-2 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Complete Your Profile
				</h1>
				<p className="text-sm text-muted-foreground">
					Tell us more about yourself to get started
				</p>
			</div>
			<OnboardingSteps />
		</Shell>
	);
}
