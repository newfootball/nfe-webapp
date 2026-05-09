import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Shell } from "@/components/shell";
import { getUserSession } from "@/src/query/user.query";
import { OnboardingSteps } from "./onboarding-steps";

export default async function OnboardingPage() {
	const [t, user] = await Promise.all([
		getTranslations("onboarding"),
		getUserSession(),
	]);

	if (!user) {
		redirect("/sign-in");
	}

	if (user.isOnboarded) {
		redirect("/");
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
