import { MailIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Shell } from "@/components/shell";

export default async function ContactPage() {
	const t = await getTranslations("contact");

	return (
		<Shell>
			<div className="container mx-auto px-4 py-16 max-w-2xl">
				<h1 className="text-4xl font-bold tracking-tight mb-4">{t("title")}</h1>
				<p className="text-lg text-muted-foreground mb-8">{t("description")}</p>

				<div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
					<MailIcon className="h-5 w-5 text-muted-foreground shrink-0" />
					<div>
						<p className="text-sm text-muted-foreground">{t("email-label")}</p>
						<a
							href="mailto:contact@nfe-foot.com"
							className="font-medium hover:underline"
						>
							contact@nfe-foot.com
						</a>
					</div>
				</div>
			</div>
		</Shell>
	);
}
