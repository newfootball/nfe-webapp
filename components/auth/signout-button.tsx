import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";

export const SignoutButton = () => {
	const t = useTranslations("auth");

	return (
		<Button variant="link" onClick={() => signOut({ redirectTo: "/" })}>
			{t("sign-out")}
		</Button>
	);
};
