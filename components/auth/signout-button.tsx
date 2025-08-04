import { Button } from "@/components/ui/button";
import { signOut } from "@/src/lib/auth-client";
import { useTranslations } from "next-intl";

export const SignoutButton = () => {
	const t = useTranslations("auth");

	return (
		<Button variant="link" onClick={() => signOut()}>
			{t("sign-out")}
		</Button>
	);
};
