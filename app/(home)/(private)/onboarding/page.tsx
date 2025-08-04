"use client";

import { Shell } from "@/components/shell";
import { getSession } from "@/src/lib/auth-client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OnboardingSteps } from "./onboarding-steps";

export default function OnboardingPage() {
	const t = useTranslations("onboarding");
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const checkProfile = async () => {
			const session = await getSession();
			if (!session || !session.data?.user) {
				router.push("/auth/sign-in");
				return;
			}

			const response = await fetch(`/api/users/${session.data.user.id}/profile`);
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
					{t("complete-your-profile")}
				</h1>
				<p className="text-sm text-muted-foreground">
					{t("tell-us-more-about-yourself")}
				</p>
			</div>
			<OnboardingSteps />
		</Shell>
	);
}
