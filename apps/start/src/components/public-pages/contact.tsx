import { publicPageContent } from "../../lib/public-page-content";
import {
	PublicPageLayout,
	type PublicPageProps,
	publicPageLinkClass,
} from "./layout";

export function ContactPage({ locale }: PublicPageProps) {
	const t = publicPageContent[locale].contact;
	return (
		<PublicPageLayout
			locale={locale}
			title={t.title}
			intro={<p>{t.description}</p>}
		>
			<div className="rounded-lg border border-border bg-muted p-6 sm:p-8">
				<p className="mb-2 text-sm text-muted-foreground">{t["email-label"]}</p>
				<a
					href="mailto:contact@nfe-foot.com"
					className={`${publicPageLinkClass} inline-block break-all py-2 font-medium`}
				>
					contact@nfe-foot.com
				</a>
			</div>
		</PublicPageLayout>
	);
}
