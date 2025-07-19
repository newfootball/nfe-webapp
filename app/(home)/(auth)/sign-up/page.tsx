import { GoogleButton } from "@/components/auth/google-button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Divider } from "@/components/ui/divider";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SignUpForm } from "./signup-form";

export default async function SignUpPage() {
	const t = await getTranslations("sign-up");

	return (
		<div className="flex justify-center items-center pt-20">
			<Card className="mx-auto max-w-sm shadow-none border-none">
				<CardHeader>
					<CardTitle className="text-2xl">{t("create-account")}</CardTitle>
					<CardDescription>
						{t("enter-your-email-below-to-create-your-account")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4">
						<SignUpForm />

						<Divider text={t("or-continue-with")} />

						<GoogleButton />
					</div>

					<div className="mt-4 text-center text-sm">
						{t("already-have-an-account")}
						<Link href="/sign-in" className="underline">
							{t("sign-in")}
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
