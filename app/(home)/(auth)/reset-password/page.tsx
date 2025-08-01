import { useTranslations } from "next-intl";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
	title: "Reset Password | NFE",
	description: "Reset your password for your NFE account",
	openGraph: {
		title: "Reset Password | NFE",
		description: "Reset your password for your NFE account",
	},
};

export default function ResetPasswordPage() {
	const t = useTranslations("reset-password");

	return (
		<div className="container flex h-screen w-screen flex-col items-center justify-center">
			<div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
				<div className="flex flex-col space-y-2 text-center">
					<h1 className="text-2xl font-semibold tracking-tight">
						{t("reset-your-password")}
					</h1>
					<p className="text-sm text-muted-foreground">
						{t("enter-your-new-password-below")}
					</p>
				</div>
				<ResetPasswordForm />
			</div>
		</div>
	);
}
